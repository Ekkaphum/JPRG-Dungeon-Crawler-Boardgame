// Declare + resolve logic for all 12 adventurer skills. See docs/10-v0.3.0-rulings.md §5 for the
// declare-immediate vs resolve-delayed split this file implements skill-by-skill.

import { SKILLS, skillStats, type SkillId } from '@content/characters';
import { applyDamageToBoss, applyDamageToFighter, computeOutgoingPlayerDamage, healFighter } from './damage';
import { onHealResolved, onPlayerDealtDamage, onTrapTriggered, onWeakPointOpened } from './scoring';
import type { Choice, Fighter, GameState } from './types';
import type { RNG } from '../rng';

function isLv2(state: GameState, fighter: Fighter, skillId: SkillId): boolean {
  return !!state.progress[fighter.playerId]?.isLv2[skillId];
}

/** Somnivar's "มนตร์ง่วงงุน" tax: player-declared skills with base ⏱ >= 5 walk 2 extra slots. */
export function applySomnivarTax(state: GameState, baseTime: number): number {
  if (state.battle!.bossId === 'Somnivar' && baseTime >= 5) return baseTime + 2;
  return baseTime;
}

/** Slots Set Trap may legally be armed on: strictly inside the skill's own ⏱ window (so the trap is
 *  a read of where the boss stops next, not a snipe anywhere on the clock — the whole point of the
 *  v0.4.2 redesign), at or above slot 0, and not already holding another trap.
 *
 *  Single source of truth on purpose: buildDeclareOptions() offers exactly this list to the UI and
 *  the bots, and declareSkill() below rejects anything outside it. Computing it in two places is
 *  what let the UI hand humans illegal slots while bots played by the rules. */
export function legalTrapSlots(state: GameState, fighter: Fighter): number[] {
  const battle = state.battle!;
  const trapTime = applySomnivarTax(state, skillStats('SetTrap', isLv2(state, fighter, 'SetTrap')).time);
  const slots: number[] = [];
  for (let s = battle.marker - 1; s > battle.marker - trapTime && s >= 0; s--) {
    if (!battle.traps.some((t) => t.slot === s)) slots.push(s);
  }
  return slots;
}

/** Escalating dice ladder shared by Quick Shot's weak point and Set Trap's cancel: 5+ on the first
 *  try, one easier per miss, automatic on the 5th, and reset the moment it lands (§5.2). */
function rollLadder(state: GameState, fighter: Fighter, skillId: SkillId, purpose: string, rng: RNG): boolean {
  const battle = state.battle!;
  const base = skillStats(skillId, isLv2(state, fighter, skillId)).rollBaseTarget ?? 5;
  const attempt = fighter.rollAttempt[skillId] ?? 0;
  const target = attempt >= 4 ? 0 : Math.max(1, base - attempt);
  const die = rng.int(1, 6);
  const success = target === 0 || die >= target;
  battle.log.push({ t: 'ROLL', playerId: fighter.playerId, purpose, die, target: target || null, success });
  fighter.rollAttempt[skillId] = success ? 0 : attempt + 1;
  return success;
}

/** Step 2+3 of a visit: declare a new action, apply any declare-immediate effect, move the pawn. */
export function declareSkill(state: GameState, fighter: Fighter, choice: Extract<Choice, { kind: 'DECLARE_ACTION' }>) {
  const battle = state.battle!;
  const skillId = choice.skillId;
  const def = SKILLS[skillId];
  const stats = skillStats(skillId, isLv2(state, fighter, skillId));
  const time = applySomnivarTax(state, stats.time);
  const landedAtSlot = battle.marker - time;

  fighter.pending = {
    skillId,
    declaredAtSlot: battle.marker,
    landedAtSlot,
    targetPlayerId: choice.targetPlayerId,
    manaSpent: choice.manaSpent,
    trapSlot: choice.trapSlot,
  };
  fighter.slot = landedAtSlot;
  fighter.stackSeq = battle.nextStackSeq++;

  switch (def.kind) {
    case 'buffCounter':
      fighter.shield = { kind: 'counter', reduction: stats.primary!, counterDmg: stats.secondary!, hitDuringWindow: false };
      break;
    case 'buffParty':
      battle.partyBuff = { atk: stats.primary!, dmgReduction: stats.secondary!, ownerId: fighter.playerId };
      break;
    case 'buffMana':
      fighter.mana = Math.min(3, fighter.mana + stats.primary!);
      fighter.shield = { kind: 'mana', reduction: stats.secondary! };
      break;
    case 'trap': {
      // Validated rather than trusted: the choice comes from a UI or a bot, and an out-of-window
      // slot would silently hand that player the pre-v0.4.2 "arm it anywhere" power.
      const legal = legalTrapSlots(state, fighter);
      if (choice.trapSlot == null || !legal.includes(choice.trapSlot)) {
        throw new Error(
          `illegal Set Trap slot ${choice.trapSlot} for player ${fighter.playerId} at marker ${battle.marker} (legal: ${legal.join(',') || 'none'})`
        );
      }
      battle.traps.push({ slot: choice.trapSlot, dmg: stats.primary!, ownerId: fighter.playerId });
      break;
    }
    case 'attackMana':
      // Mana is paid up front and never refunded, even if the attack later fizzles (§5.1/§8).
      fighter.mana = Math.max(0, fighter.mana - (choice.manaSpent ?? 0));
      break;
  }

  battle.log.push({
    t: 'DECLARE',
    playerId: fighter.playerId,
    slot: battle.marker,
    skillId,
    landSlot: landedAtSlot,
    label: def.name.th,
  });
}

function rollTarget(state: GameState, fighter: Fighter, skillId: SkillId, baseTarget: number): number {
  const attempt = fighter.rollAttempt[skillId] ?? 0; // 0-indexed: 0 = first attempt
  const target = Math.max(1, baseTarget - attempt);
  return attempt >= 4 ? 0 : target; // attempt index 4 = 5th try = auto-success (§5.2)
}

/** Step 1 of a visit: resolve whatever this fighter declared last visit, if anything (first visit
 *  to any pawn has nothing pending — §4.3). */
export function resolveFighterPending(state: GameState, fighter: Fighter, rng: RNG) {
  const battle = state.battle!;
  const pending = fighter.pending;
  if (!pending) return;
  const skillId = pending.skillId;
  const def = SKILLS[skillId];
  const stats = skillStats(skillId, isLv2(state, fighter, skillId));

  const dealAttack = (rawBase: number, ignoresArmor: boolean) => {
    const outgoing = computeOutgoingPlayerDamage(battle, rawBase);
    const result = applyDamageToBoss(state, fighter.playerId, outgoing, { ignoresArmor, skillId });
    onPlayerDealtDamage(state, fighter.playerId, skillId, result.effective);
    battle.log.push({ t: 'RESOLVE_ATTACK', playerId: fighter.playerId, skillId, targetId: 'boss', dmg: result.effective, wasted: false });
    return result;
  };

  switch (def.kind) {
    case 'attack': {
      if (skillId === 'TwinShot') {
        for (let i = 0; i < (stats.secondary ?? 1); i++) {
          if (battle.outcome !== 'in_progress') break;
          dealAttack(stats.primary!, false);
        }
      } else {
        dealAttack(stats.primary!, skillId === 'Smite');
      }
      break;
    }
    case 'attackGated': {
      // Berserk: HP<=5 condition re-checked at resolve — may have been healed away in the interim.
      if (fighter.hp <= 5) {
        dealAttack(stats.primary!, false);
      } else {
        battle.log.push({ t: 'RESOLVE_ATTACK', playerId: fighter.playerId, skillId, targetId: 'boss', dmg: 0, wasted: true });
      }
      break;
    }
    case 'attackRoll': {
      dealAttack(stats.primary!, false);
      if (rollLadder(state, fighter, skillId, 'QuickShot weak point', rng)) {
        battle.weakPointActive = true;
        onWeakPointOpened(state, fighter.playerId);
      }
      break;
    }
    case 'attackMana': {
      const base = stats.primary! + stats.secondary! * (pending.manaSpent ?? 0);
      dealAttack(base, false);
      break;
    }
    case 'heal': {
      const target = battle.fighters.find((f) => f.playerId === pending.targetPlayerId);
      if (!target || !target.alive) {
        battle.log.push({ t: 'RESOLVE_HEAL', playerId: fighter.playerId, targetId: pending.targetPlayerId ?? -1, amount: 0, wasted: true });
      } else {
        const amount = healFighter(target, stats.primary!);
        battle.log.push({ t: 'RESOLVE_HEAL', playerId: fighter.playerId, targetId: target.playerId, amount, wasted: false });
        onHealResolved(state, fighter.playerId, amount);
      }
      break;
    }
    case 'buffCounter': {
      // Nothing to pay out here any more — Counter ripostes the instant each hit lands (see
      // dealDamageToFighterFromBoss), so reaching your turn just closes the window.
      fighter.shield = null;
      battle.log.push({ t: 'RESOLVE_BUFF', playerId: fighter.playerId, skillId });
      break;
    }
    case 'buffParty': {
      if (battle.partyBuff?.ownerId === fighter.playerId) battle.partyBuff = null;
      battle.log.push({ t: 'RESOLVE_BUFF', playerId: fighter.playerId, skillId });
      break;
    }
    case 'buffMana': {
      if (fighter.shield?.kind === 'mana') fighter.shield = null;
      battle.log.push({ t: 'RESOLVE_BUFF', playerId: fighter.playerId, skillId });
      break;
    }
    case 'trap': {
      // All-or-nothing at declare time — nothing left to resolve.
      break;
    }
  }

  fighter.pending = null;
}

/** Checks every trap against the marker every tick (before that slot's visit queue runs) — see
 *  docs/10-v0.3.0-rulings.md §6. Must run once per marker tick regardless of who's being visited. */
export function processTrapsAtMarker(state: GameState, rng: RNG) {
  const battle = state.battle!;
  const here = battle.traps.filter((t) => t.slot === battle.marker);
  if (here.length === 0) return;
  battle.traps = battle.traps.filter((t) => t.slot !== battle.marker);
  for (const trap of here) {
    if (battle.bossSlot !== battle.marker) {
      battle.log.push({ t: 'RESOLVE_TRAP_EXPIRE', slot: trap.slot });
      continue;
    }
    const result = applyDamageToBoss(state, trap.ownerId, trap.dmg, { ignoresArmor: true, skillId: 'SetTrap' });
    onTrapTriggered(state, trap.ownerId);
    battle.log.push({ t: 'RESOLVE_TRAP_TRIGGER', slot: trap.slot, dmg: result.effective, ownerId: trap.ownerId });

    // Cancelling the boss's declared move is a dice check now, not automatic. Same escalating
    // ladder as the weak point, so a party that keeps landing traps gets there eventually.
    const owner = battle.fighters.find((f) => f.playerId === trap.ownerId);
    if (owner && battle.bossPending && battle.outcome === 'in_progress') {
      if (rollLadder(state, owner, 'SetTrap', 'Trap cancel', rng)) battle.bossPending = null;
    }
  }
}

/** Damage landing on a player fighter from the boss — the single funnel, so Counter's riposte and
 *  Blessing's flat reduction apply uniformly.
 *
 *  Counter now strikes back the moment each hit lands, once per hit, instead of banking one strike
 *  for the fighter's next turn. It fires even on a lethal hit: the alternative lets the boss's
 *  biggest attacks — precisely what Counter exists to punish — dodge the riposte by killing first. */
export function dealDamageToFighterFromBoss(state: GameState, fighter: Fighter, rawDamage: number): number {
  const battle = state.battle!;
  // Read before applying: dying clears the shield.
  const counterDmg = fighter.shield?.kind === 'counter' ? fighter.shield.counterDmg ?? 0 : 0;
  const applied = applyDamageToFighter(state, fighter, rawDamage);

  if (counterDmg > 0 && battle.outcome === 'in_progress') {
    const outgoing = computeOutgoingPlayerDamage(battle, counterDmg);
    const result = applyDamageToBoss(state, fighter.playerId, outgoing, { ignoresArmor: false, skillId: 'CounterAttack' });
    onPlayerDealtDamage(state, fighter.playerId, 'CounterAttack', result.effective);
    battle.log.push({
      t: 'RESOLVE_ATTACK',
      playerId: fighter.playerId,
      skillId: 'CounterAttack',
      targetId: 'boss',
      dmg: result.effective,
      wasted: false,
    });
  }
  return applied;
}
