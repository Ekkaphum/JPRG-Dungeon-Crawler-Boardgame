// Declare + resolve logic for all 12 adventurer skills. See docs/RULINGS.md §5 and §7 for the
// declare-immediate vs resolve-delayed split this file implements skill-by-skill.

import { CHARACTERS, SKILLS, skillStats, type SkillId } from '@content/characters';
import { applyDamageToBoss, applyDamageToFighter, computeOutgoingPlayerDamage, healFighter } from './damage';
import { onHealResolved, onPlayerDealtDamage, onTrapTriggered, onWeakPointOpened } from './scoring';
import type { Choice, Fighter, GameState } from './types';
import type { RNG } from '../rng';

function isLv2(state: GameState, fighter: Fighter, skillId: SkillId): boolean {
  return !!state.progress[fighter.playerId]?.isLv2[skillId];
}

/** Slash's "ยิ่งใกล้ตายยิ่งแรง" damage tier (GAME_DESIGN.md §8). Checked only at *resolve*, not at
 *  declare: v0.3.2 folded Berserk into Slash, so this no longer gates whether the action happens at
 *  all — it only picks which of the two damage numbers lands. A Luna heal arriving mid-flight now
 *  downgrades Matt's hit (11 → 6) instead of deleting it outright; see docs/RULINGS.md §7. */
const ATTACK_GATED_HP_THRESHOLD = 5;

/** Somnivar's "มนตร์ง่วงงุน" tax: player-declared skills with base ⏱ >= 5 walk 2 extra slots. */
export function applySomnivarTax(state: GameState, baseTime: number): number {
  if (state.battle!.bossId === 'Somnivar' && baseTime >= 5) return baseTime + 2;
  return baseTime;
}

/** Slots Set Trap may legally be armed on: strictly inside the skill's own ⏱ window (so the trap is
 *  a read of where the boss stops next, not a snipe anywhere on the clock — the whole point of the
 *  v0.3.0.2 redesign), at or above slot 0, and not already holding another trap.
 *
 *  Single source of truth on purpose: buildDeclareOptions() offers exactly this list to the UI and
 *  the bots, and declareSkill() below rejects anything outside it. Computing it in two places is
 *  what let the UI hand humans illegal slots while bots played by the rules. */
export function legalTrapSlots(state: GameState, fighter: Fighter): number[] {
  const battle = state.battle!;
  const trapTime = applySomnivarTax(state, skillStats('SetTrap', isLv2(state, fighter, 'SetTrap')).time);
  const slots: number[] = [];
  // s > 0, not s >= 0: slot 0 is never playable (the walk loop ends the battle the instant the
  // marker reaches it, before processing anything there — see walk.ts) so a trap armed on it could
  // never trigger.
  for (let s = battle.marker - 1; s > battle.marker - trapTime && s > 0; s--) {
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

  // Validated at the engine boundary rather than trusted from the caller — the UI already builds
  // legal choices, but a bot or a hand-built Choice bypasses that entirely. Without this, the
  // engine would let a player declare a skill they don't own, overspend mana they don't have, aim
  // Heal at nobody, or Guard themselves (see legalTrapSlots above for the same reasoning already
  // applied to Set Trap).
  if (def.charId !== fighter.charId) {
    throw new Error(`${skillId} does not belong to ${fighter.charId} (player ${fighter.playerId} declared it)`);
  }
  if (def.kind === 'attackMana') {
    const spent = choice.manaSpent ?? 0;
    if (!Number.isInteger(spent) || spent < 0 || spent > 3 || spent > fighter.mana) {
      throw new Error(`illegal mana spend ${spent} for player ${fighter.playerId} (has ${fighter.mana})`);
    }
  }
  if (def.kind === 'heal') {
    const target = battle.fighters.find((f) => f.playerId === choice.targetPlayerId);
    if (!target || !target.alive) {
      throw new Error(`illegal Heal target ${choice.targetPlayerId} for player ${fighter.playerId} (target must be alive when declared)`);
    }
  }
  if (def.kind === 'guard') {
    // Self-guard is rejected rather than silently no-op'd: it would read on the board as a defensive
    // action while doing literally nothing, and every existing damage path already sends a fighter's
    // own damage to themselves.
    const target = battle.fighters.find((f) => f.playerId === choice.targetPlayerId);
    if (!target || !target.alive || target.playerId === fighter.playerId) {
      throw new Error(
        `illegal Guard target ${choice.targetPlayerId} for player ${fighter.playerId} (must be a different, living ally)`
      );
    }
  }

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
    case 'guard':
      // Declare-immediate (docs/RULINGS.md §5 group B): the protection has to be up *before* the
      // boss's already-announced move lands, or reading the boss — the whole point of §4.4 — would
      // buy Matt nothing. Only one link can exist at a time; a second Guard replaces the first.
      battle.guard = {
        guardianId: fighter.playerId,
        wardId: choice.targetPlayerId!,
        reduction: stats.primary ?? 0,
        wardAtk: stats.secondary ?? 0,
      };
      break;
    case 'trap': {
      // Validated rather than trusted: the choice comes from a UI or a bot, and an out-of-window
      // slot would silently hand that player the pre-v0.3.0.2 "arm it anywhere" power.
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
    const outgoing = computeOutgoingPlayerDamage(battle, rawBase, fighter.playerId);
    const result = applyDamageToBoss(state, fighter.playerId, outgoing, { ignoresArmor, skillId });
    onPlayerDealtDamage(state, fighter.playerId, skillId, result.effective);
    battle.log.push({ t: 'RESOLVE_ATTACK', playerId: fighter.playerId, skillId, targetId: 'boss', dmg: result.effective, wasted: false });
    return result;
  };

  switch (def.kind) {
    case 'attack': {
      // Multi-hit is driven by whether `secondary` (hit count) is set at all, not by which skill
      // this is — was hardcoded to `skillId === 'TwinShot'` specifically, which silently made
      // Dax's Flurry (also 'attack' kind, also has a secondary hit count) resolve as a single hit
      // instead of 3. Slash/Smite have no `secondary`, so this is unchanged for them.
      if (stats.secondary != null) {
        for (let i = 0; i < stats.secondary; i++) {
          if (battle.outcome !== 'in_progress') break;
          dealAttack(stats.primary!, false);
        }
      } else {
        dealAttack(stats.primary!, skillId === 'Smite');
      }
      break;
    }
    case 'attackGated': {
      // Slash: the HP<=5 tier is re-checked here, at resolve, so it reflects the damage Matt has
      // actually taken while the swing was in flight — including a Luna heal that pulls him back
      // above the line. The action never fizzles now (v0.3.2); it just lands for the lower number.
      const boosted = fighter.hp <= ATTACK_GATED_HP_THRESHOLD && stats.secondary != null;
      dealAttack(boosted ? stats.secondary! : stats.primary!, false);
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
        onHealResolved(state, fighter.playerId, target.playerId, amount);
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
    case 'guard': {
      // Same lifetime rule as buffParty: only tear down a link this fighter still owns, so a Guard
      // that was already replaced (or cleared by the guardian's death) isn't cancelled twice.
      if (battle.guard?.guardianId === fighter.playerId) battle.guard = null;
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
    if (battle.outcome !== 'in_progress') break;
    if (battle.bossSlot !== battle.marker) {
      battle.log.push({ t: 'RESOLVE_TRAP_EXPIRE', slot: trap.slot });
      continue;
    }

    // The boss stopping on the trap only springs it — whether it actually cuts is a roll now, same
    // escalating ladder as Quick Shot's weak point (5+, easier by 1 each miss, 5th attempt auto-
    // succeeds). A miss means no damage AND no cancel — the trap fired too weakly to do either.
    const owner = battle.fighters.find((f) => f.playerId === trap.ownerId)!;
    const success = rollLadder(state, owner, 'SetTrap', 'SetTrap trigger', rng);
    if (!success) {
      battle.log.push({ t: 'RESOLVE_TRAP_TRIGGER', slot: trap.slot, dmg: 0, ownerId: trap.ownerId });
      continue;
    }

    const result = applyDamageToBoss(state, trap.ownerId, trap.dmg, { ignoresArmor: true, skillId: 'SetTrap', countsAsAttack: false });
    onTrapTriggered(state, trap.ownerId);
    battle.log.push({ t: 'RESOLVE_TRAP_TRIGGER', slot: trap.slot, dmg: result.effective, ownerId: trap.ownerId });
    if (battle.bossPending && battle.outcome === 'in_progress') battle.bossPending = null;
  }
}

/** Where damage aimed at `fighter` actually lands, after Matt's Guard. Returns the ward's guardian
 *  when a link is up and the guardian is still standing, otherwise the original target.
 *
 *  Deliberately *not* recursive: a guardian who is themselves being guarded still eats their ward's
 *  damage personally. Only one Guard link can exist at a time today so the case can't arise, but
 *  resolving one hop keeps it that way by construction rather than by luck. */
export function redirectTarget(state: GameState, fighter: Fighter): { recipient: Fighter; reduction: number } {
  const battle = state.battle!;
  const link = battle.guard;
  if (!link || link.wardId !== fighter.playerId) return { recipient: fighter, reduction: 0 };
  const guardian = battle.fighters.find((f) => f.playerId === link.guardianId);
  if (!guardian || !guardian.alive) return { recipient: fighter, reduction: 0 };
  return { recipient: guardian, reduction: link.reduction };
}

/** Applies incoming boss damage to a player fighter (Guard redirect, Blessing's flat reduction,
 *  mana/counter shields, HP floor, death) but does *not* resolve any triggered counter-strike — it
 *  only reports how much counter damage is now queued. Single-target hits resolve that queue
 *  immediately via `dealDamageToFighterFromBoss` below; AoE hits (bossAI.ts) apply every target's
 *  damage first and resolve counters only once the whole wave has landed — see `resolveQueuedCounter`.
 *
 *  `recipient` is who actually took it, which callers must use for both the log entry and the
 *  counter-strike: a riposte belongs to whoever was hit, not to whoever the boss aimed at. Under an
 *  AoE this is called once per target, so a guardian legitimately takes their own hit *and* their
 *  ward's — Guard is meant to be dangerous against moves that hit everyone. */
export function applyBossDamageToFighter(
  state: GameState,
  fighter: Fighter,
  rawDamage: number
): { applied: number; counterDmg: number; recipient: Fighter } {
  const { recipient, reduction } = redirectTarget(state, fighter);
  // Read before applying: dying clears the shield.
  const counterDmg = recipient.shield?.kind === 'counter' ? recipient.shield.counterDmg ?? 0 : 0;
  const applied = applyDamageToFighter(state, recipient, Math.max(0, rawDamage - reduction));
  return { applied, counterDmg, recipient };
}

/** Resolves one fighter's counter-strike queued by `applyBossDamageToFighter` above, against the
 *  boss. Fires even if the fighter has since died on the same hit — Counter exists to punish the
 *  boss's biggest attacks, which are exactly the ones that might kill the fighter landing it. */
export function resolveQueuedCounter(state: GameState, fighter: Fighter, counterDmg: number) {
  const battle = state.battle!;
  if (counterDmg <= 0 || battle.outcome !== 'in_progress') return;
  // Each character has at most one buffCounter-kind skill in their kit — look up which one this
  // fighter actually has (Matt's Counter Attack, Dax's Riposte, ...) instead of assuming Matt's.
  // Previously hardcoded to 'CounterAttack' always, which would have mislabeled Dax's ripostes in
  // the log/UI and made a Riposte-specific score condition unreachable.
  const counterSkillId = CHARACTERS[fighter.charId].skills.find((sid) => SKILLS[sid].kind === 'buffCounter') ?? 'CounterAttack';
  const outgoing = computeOutgoingPlayerDamage(battle, counterDmg, fighter.playerId);
  const result = applyDamageToBoss(state, fighter.playerId, outgoing, { ignoresArmor: false, skillId: counterSkillId });
  onPlayerDealtDamage(state, fighter.playerId, counterSkillId, result.effective);
  battle.log.push({
    t: 'RESOLVE_ATTACK',
    playerId: fighter.playerId,
    skillId: counterSkillId,
    targetId: 'boss',
    dmg: result.effective,
    wasted: false,
  });
}

/** Damage landing on a player fighter from a single-target boss move — the common case, where
 *  "apply then immediately resolve the counter" is correct because there's only ever one target.
 *  AoE moves (bossAI.ts) use applyBossDamageToFighter + resolveQueuedCounter directly instead, so
 *  every target takes the hit before any counter fires — see GAME_DESIGN_v0_3_0.md's Counter
 *  interaction: an AoE hits everyone as if simultaneously, so a Counter it triggers can't retroactively
 *  make the boss "already dead" for targets later in the same wave. */
export function dealDamageToFighterFromBoss(
  state: GameState,
  fighter: Fighter,
  rawDamage: number
): { applied: number; recipient: Fighter } {
  const { applied, counterDmg, recipient } = applyBossDamageToFighter(state, fighter, rawDamage);
  resolveQueuedCounter(state, recipient, counterDmg);
  return { applied, recipient };
}
