// Declare + resolve logic for every adventurer skill. See docs/RULINGS.md §5 and §7 for the
// declare-immediate vs resolve-delayed split this file implements skill-by-skill.

import {
  ASSASSINATE_EXECUTE_BONUS,
  ASSASSINATE_EXECUTE_THRESHOLD,
  CHARACTERS,
  DEATH_COIL_HP_COST,
  LIFESTEAL,
  SHADOW_MAX,
  SHADOW_PER_ASSASSINATE,
  SKILLS,
  SOULS_PER_DEATH_COIL,
  SAND_MAX,
  SAND_PER_REWIND,
  SAND_PER_SLOW_DECLARE,
  scorePoints,
  skillStats,
  type SkillDef,
  type SkillId,
  type SkillLevelStats,
} from '@content/characters';
import { applyDamageToBoss, applyDamageToFighter, computeOutgoingPlayerDamage, healFighter, pushScore, reviveFighterNow } from './damage';
import { onGuardRedirected, onHealResolved, onPlayerDealtDamage, onTrapTriggered, onWeakPointOpened } from './scoring';
import { ailmentRollPenalty, ailmentTimeTax, cleanseAilments, consumeTimeTaxAilments, isSilenced } from './ailments';
import { spendItems } from './items';
import type { Choice, Fighter, GameState } from './types';
import type { RNG } from '../rng';

function isLv2(state: GameState, fighter: Fighter, skillId: SkillId): boolean {
  return !!state.progress[fighter.playerId]?.isLv2[skillId];
}

/** Slash's "ยิ่งใกล้ตายยิ่งแรง" damage tier (GAME_DESIGN.md §8). Checked only at *resolve*, not at
 *  declare: v0.3.2 folded Berserk into Slash, so this no longer gates whether the action happens at
 *  all — it only picks which of the two damage numbers lands. A Luna heal arriving mid-flight now
 *  downgrades Eric's hit (11 → 6) instead of deleting it outright; see docs/RULINGS.md §7. */
const ATTACK_GATED_HP_THRESHOLD = 5;

/** How many clock slots a sprung Trap! pushes the boss's declared move back by (v0.3.9 — it used to
 *  delete the move outright). See processTrapsAtMarker for why delaying costs the boss more tempo
 *  than cancelling did. */
/** How long a weak point stays open, in clock slots (v0.3.15). Matched to Blessing's four so the
 *  two buffs a party stacks for a big hit have the same shape and can be lined up without a second
 *  rule to learn. Replaces "until the boss's next action", which v0.3.14 made almost meaningless. */
export const WEAK_POINT_SLOTS = 4;

/** Highest slot the marker may ever sit on — the clock starts at 24 and counts down, so Rewind can
 *  restore time but never manufacture more than the battle began with. */
const CLOCK_TOP_SLOT = 24;

/** Skills 🔇 silence blocks — every one that spends a resource. Listed explicitly rather than
 *  derived from SkillKind because the tell is the cost, not the family: Fireball and Meteor spend
 *  mana but are ordinary `attackMana` cards, while Assassinate and Death Coil are plain `attack`. */
const SPENDS_RESOURCE = new Set<SkillId>(['Fireball', 'Meteor', 'Rewind', 'Assassinate', 'DeathCoil']);

/** Somnivar's "มนตร์ง่วงงุน" tax: player-declared skills with base ⏱ >= 5 walk 2 extra slots. */
export function applySomnivarTax(state: GameState, baseTime: number): number {
  if (state.battle!.bossId !== 'Somnivar') return baseTime;
  if (baseTime >= 6) return baseTime + 2;
  if (baseTime >= 4) return baseTime + 1;
  return baseTime;
}

/** Every ⏱ modifier that applies to one declare, in one place: Somnivar's aura first, then the
 *  fighter's own ❄️/💫 ailments on top. Kept separate from applySomnivarTax because the bots call
 *  that one directly to price candidate skills and must keep seeing the boss-level tax alone. */
export function effectiveDeclareTime(state: GameState, fighter: Fighter, baseTime: number): number {
  // v0.5 haste items subtract last and floor at 1: a free action must never buy a 0-⏱ turn, which
  // would let a pawn sit on the marker and be re-visited forever.
  const taxed = applySomnivarTax(state, baseTime) + ailmentTimeTax(fighter);
  return Math.max(1, taxed - fighter.itemHaste);
}

/** Slots Trap! may legally be armed on: strictly inside the skill's own ⏱ window (so the trap is
 *  a read of where the boss stops next, not a snipe anywhere on the clock), at or above slot 0, and
 *  not already holding another trap. ⏱4 gives exactly the "up to 3 slots ahead" range the v0.4.0
 *  redesign calls for (marker-1..marker-3) without needing a separate range field.
 *
 *  Single source of truth on purpose: buildDeclareOptions() offers exactly this list to the UI and
 *  the bots, and declareSkill() below rejects anything outside it. Computing it in two places is
 *  what let the UI hand humans illegal slots while bots played by the rules. */
export function legalTrapSlots(state: GameState, fighter: Fighter): number[] {
  const battle = state.battle!;
  const trapTime = applySomnivarTax(state, skillStats('Trap', isLv2(state, fighter, 'Trap')).time);
  const slots: number[] = [];
  // s > 0, not s >= 0: slot 0 is never playable (the walk loop ends the battle the instant the
  // marker reaches it, before processing anything there — see walk.ts) so a trap armed on it could
  // never trigger.
  for (let s = battle.marker - 1; s > battle.marker - trapTime && s > 0; s--) {
    if (!battle.traps.some((t) => t.slot === s)) slots.push(s);
  }
  return slots;
}

/** Dice check shared by Sharp Shooting's weak point and Trap!'s cancel. Kit's Skill Improvement
 *  passive replaces the old per-battle ladder: each miss permanently lowers only the skill that
 *  rolled (floor 2, never resets, carries across battles). Sharp Shooting and Trap! never improve
 *  one another. Any other roll-using character (Dax's Focus) keeps the original per-battle,
 *  per-skill, reset-on-success ladder with its 5th-attempt auto-success. */
function rollLadder(state: GameState, fighter: Fighter, skillId: SkillId, purpose: string, rng: RNG): boolean {
  const battle = state.battle!;
  const base = skillStats(skillId, isLv2(state, fighter, skillId)).rollBaseTarget ?? 5;
  const improvementSkill = fighter.charId === 'Kit' && (skillId === 'SharpShooting' || skillId === 'Trap') ? skillId : null;
  const progress = state.progress[fighter.playerId];

  let target: number;
  if (improvementSkill) {
    target = Math.max(2, base - (progress?.rollPenalty[improvementSkill] ?? 0));
  } else {
    const attempt = fighter.rollAttempt[skillId] ?? 0;
    target = attempt >= 4 ? 0 : Math.max(1, base - attempt);
  }
  // 👁️ blind (v0.4.0) is applied after the ladder, so it can push a target back above the floor the
  // ladder just brought it down to — the point of the ailment is that the ladder stops rescuing you.
  if (target > 0) target += ailmentRollPenalty(fighter);

  const die = rng.int(1, 6);
  const success = target === 0 || die >= target;
  battle.log.push({ t: 'ROLL', playerId: fighter.playerId, purpose, die, target: target || null, success });

  if (improvementSkill) {
    if (!success && progress) progress.rollPenalty[improvementSkill] = (progress.rollPenalty[improvementSkill] ?? 0) + 1;
  } else {
    const attempt = fighter.rollAttempt[skillId] ?? 0;
    fighter.rollAttempt[skillId] = success ? 0 : attempt + 1;
  }
  return success;
}

/** Applies a single hit of an `attack`-kind skill (Slash, Power Strike, Twin Shot, Flurry, ...): the
 *  full damage pipeline (party/weak-point/Guard/Berserk buffs, boss armor, score hooks, log). Shared
 *  between the immediate path (declareSkill, for skills marked `immediate`) and the resolve-delayed
 *  path (resolveFighterPending, for everyone else) so both run through the exact same math. */
function dealAttackFor(state: GameState, fighter: Fighter, skillId: SkillId, rawBase: number, ignoresArmor: boolean, manaSpent = 0) {
  const battle = state.battle!;
  // v0.4.0 — the game's only cleanse, and it rides an attack on purpose.
  //
  // It lived on Heal first. That was thematically obvious and measurably wrong: a party that spends
  // Luna's turns cleansing stops killing the boss and loses to the clock instead (hard win rate
  // 54.1% -> 47.8% once bots were taught to cleanse). It is the same lesson §8.0 already records
  // from Guard v1 — in this ruleset a support action that produces no damage cannot pay its own ⏱.
  //
  // Aura Smite is the light-element attack (see the element table in docs/EXPANSION_DESIGN.md §1.4:
  // light pierces armor and washes off status), so the answer to a status now comes attached to
  // damage rather than instead of it, and Luna does not have to choose between healing and saving.
  if (skillId === 'AuraSmite') {
    for (const f of battle.fighters) {
      if (f.alive) cleanseAilments(state, f);
    }
  }
  // v0.4.0 — Smoke Bomb's payoff rides the *first* attack out of hiding, so it is added before the
  // usual buff pipeline and consumed whether or not the hit ends up mattering.
  const stealthBonus = fighter.stealthUntilSlot != null ? fighter.stealthStrikeBonus : 0;
  const outgoing = computeOutgoingPlayerDamage(battle, rawBase + stealthBonus, fighter.playerId);
  const result = applyDamageToBoss(state, fighter.playerId, outgoing, { ignoresArmor, skillId });
  // Ordering matters: kage2 asks "did you come out of hiding to land this", so scoring has to read
  // the stealth flag *before* the attack clears it.
  onPlayerDealtDamage(state, fighter.playerId, skillId, result.effective, manaSpent);
  if (fighter.stealthUntilSlot != null) {
    fighter.stealthUntilSlot = null;
    fighter.stealthStrikeBonus = 0;
    battle.log.push({ t: 'STEALTH_BROKEN', playerId: fighter.playerId });
  }
  battle.log.push({ t: 'RESOLVE_ATTACK', playerId: fighter.playerId, skillId, targetId: 'boss', dmg: result.effective, wasted: false });
  // Morvane's only route back to HP — Heal cannot touch him (see healFighter). Applied after the
  // hit so a Drain that finishes the boss still heals him.
  const drain = LIFESTEAL[skillId];
  if (drain && result.effective > 0) healSelfUndead(fighter, drain);
  return result;
}

/** Bypasses healFighter's undead block on purpose: this is Morvane draining life himself, which is
 *  exactly the thing his passive says still works. */
function healSelfUndead(fighter: Fighter, amount: number) {
  if (!fighter.alive) return;
  fighter.hp = Math.min(fighter.maxHp, fighter.hp + amount);
}

/** Assassinate's and Death Coil's live damage, which both read state the skill table cannot: the
 *  boss's current HP fraction, and whether Morvane chose to pay the HP surcharge. */
function v040SignatureDamage(state: GameState, fighter: Fighter, skillId: SkillId, stats: SkillLevelStats, paidHp: boolean): number {
  const battle = state.battle!;
  if (skillId === 'Assassinate') {
    const executing = battle.bossHp <= battle.bossHpMax * ASSASSINATE_EXECUTE_THRESHOLD;
    return (stats.primary ?? 0) + (executing ? ASSASSINATE_EXECUTE_BONUS : 0);
  }
  if (skillId === 'DeathCoil') return paidHp ? (stats.secondary ?? 0) : (stats.primary ?? 0);
  return stats.primary ?? 0;
}

/** Resolves an `attack`-kind skill's hit(s) — single or multi-hit, driven by whether `secondary`
 *  (hit count) is set. Used by both the immediate and resolve-delayed paths. */
function resolveAttackHits(state: GameState, fighter: Fighter, skillId: SkillId, stats: SkillLevelStats, def: SkillDef, paidHp = false) {
  const battle = state.battle!;
  // Assassinate and Death Coil read state the skill table cannot see (live boss HP; whether the HP
  // surcharge was paid), so their damage is computed rather than looked up. Both are single-hit.
  if (skillId === 'Assassinate' || skillId === 'DeathCoil') {
    dealAttackFor(state, fighter, skillId, v040SignatureDamage(state, fighter, skillId, stats, paidHp), def.ignoresArmor === true);
    return;
  }
  if (stats.secondary != null) {
    for (let i = 0; i < stats.secondary; i++) {
      if (battle.outcome !== 'in_progress') break;
      dealAttackFor(state, fighter, skillId, stats.primary!, def.ignoresArmor === true);
    }
  } else {
    dealAttackFor(state, fighter, skillId, stats.primary!, def.ignoresArmor === true);
  }
}

/** Resolves an `attackRoll`-kind skill: the hit, then the weak-point roll. Used by both the
 *  immediate and resolve-delayed paths. */
function resolveAttackRoll(state: GameState, fighter: Fighter, skillId: SkillId, stats: SkillLevelStats, rng: RNG) {
  const battle = state.battle!;
  dealAttackFor(state, fighter, skillId, stats.primary!, false);
  if (rollLadder(state, fighter, skillId, `${skillId} weak point`, rng)) {
    battle.weakPoint = { ownerId: fighter.playerId, expiresAtSlot: battle.marker - WEAK_POINT_SLOTS };
    onWeakPointOpened(state, fighter.playerId);
  }
}

/** Step 2+3 of a visit: declare a new action, apply any declare-immediate effect, move the pawn.
 *  `rng` is only consumed when the declared skill is both `immediate` and `attackRoll`-kind (Sharp
 *  Shooting) — its weak-point roll happens right here instead of at resolve. */
export function declareSkill(state: GameState, fighter: Fighter, choice: Extract<Choice, { kind: 'DECLARE_ACTION' }>, rng: RNG) {
  const battle = state.battle!;
  // v0.5: items are a free action taken *before* the skill is declared, so they resolve first and
  // anything they set (haste, +damage, pierce) is already live when the skill below is priced.
  spendItems(state, fighter, choice.useItems);
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
  // v0.4.0 resource gates. Validated here with mana rather than at each resolution site so an
  // illegal declare is rejected before the pawn has moved.
  // Checked here rather than in the 'rewind' case below so the Time Spiral grant further down
  // cannot part-fund the very declare that spends it.
  if (skillId === 'Rewind' && fighter.sand < SAND_PER_REWIND) {
    throw new Error(`Rewind needs ${SAND_PER_REWIND} sand (player ${fighter.playerId} has ${fighter.sand})`);
  }
  if (skillId === 'Assassinate' && fighter.shadow < SHADOW_PER_ASSASSINATE) {
    throw new Error(`Assassinate needs ${SHADOW_PER_ASSASSINATE} shadow (player ${fighter.playerId} has ${fighter.shadow})`);
  }
  if (skillId === 'DeathCoil') {
    if (fighter.souls < SOULS_PER_DEATH_COIL) {
      throw new Error(`Death Coil needs ${SOULS_PER_DEATH_COIL} souls (player ${fighter.playerId} has ${fighter.souls})`);
    }
    // The HP surcharge is optional and has to be survivable — paying it cannot be what kills him,
    // or the card would read as a suicide button rather than a gamble.
    if (choice.payHp && fighter.hp <= DEATH_COIL_HP_COST) {
      throw new Error(`Death Coil's HP surcharge would kill player ${fighter.playerId}`);
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

  // 🔇 silence (v0.4.0) bars anything that spends a resource. Validated at the engine boundary
  // alongside the other declare checks, for the same reason those are: a bot or a hand-built Choice
  // bypasses the UI entirely.
  if (isSilenced(fighter) && SPENDS_RESOURCE.has(skillId)) {
    throw new Error(`${skillId} cannot be declared while silenced (player ${fighter.playerId})`);
  }

  const stats = skillStats(skillId, isLv2(state, fighter, skillId));
  const time = effectiveDeclareTime(state, fighter, stats.time);
  fighter.itemHaste = 0; // banked discount is spent by this declare whether or not it changed the total
  const landedAtSlot = battle.marker - time;
  // Where the caster is standing as they declare, captured before the pawn walks below. Smoke Bomb
  // needs it: reading fighter.slot after the move would cover whoever happens to be at the
  // *destination* rather than the people standing with Kage when he threw it.
  const declaredFromSlot = fighter.slot;

  fighter.pending = {
    skillId,
    declaredAtSlot: battle.marker,
    landedAtSlot,
    targetPlayerId: choice.targetPlayerId,
    manaSpent: choice.manaSpent,
    trapSlot: choice.trapSlot,
    payHp: choice.payHp,
  };
  fighter.slot = landedAtSlot;
  fighter.stackSeq = battle.nextStackSeq++;

  // Logged before any immediate resolution below so the log reads "declared, then resolved" in
  // that order, not the other way round.
  battle.log.push({
    t: 'DECLARE',
    playerId: fighter.playerId,
    slot: battle.marker,
    skillId,
    landSlot: landedAtSlot,
    label: def.name.th,
  });

  // ── v0.4.0 passives that fire on the declare itself ──
  // Chrono's Time Spiral: sand accrues from *committing* to a slow action, so the resource is
  // earned by the same patience Rewind then spends.
  if (fighter.charId === 'Chrono' && stats.time >= SAND_PER_SLOW_DECLARE) {
    fighter.sand = Math.min(SAND_MAX, fighter.sand + 1);
  }
  // Costs are paid on declare, not on resolve: the commitment is the turn, and a boss that kills
  // the caster before the hit lands must not also refund the resource.
  if (skillId === 'Assassinate') fighter.shadow -= SHADOW_PER_ASSASSINATE;
  if (skillId === 'DeathCoil') {
    fighter.souls -= SOULS_PER_DEATH_COIL;
    if (choice.payHp) applyDamageToFighter(state, fighter, DEATH_COIL_HP_COST, { selfInflicted: true });
  }
  // Chrono's call on the boss's next move (chrono1), carried until the boss actually acts.
  if (fighter.charId === 'Chrono' && choice.predictedBossMove) {
    fighter.predictedBossMove = choice.predictedBossMove;
  }
  // ❄️/💫 are spent by the declare they taxed, not by the clock — so the penalty lands exactly once.
  consumeTimeTaxAilments(state, fighter);

  switch (def.kind) {
    case 'buffCounter':
      fighter.shield = { kind: 'counter', reduction: stats.primary!, counterDmg: stats.secondary!, hitDuringWindow: false };
      break;
    case 'buffParty':
      battle.partyBuff = {
        atk: stats.primary!,
        dmgReduction: stats.secondary!,
        ownerId: fighter.playerId,
        expiresAtSlot: battle.marker - 4,
      };
      break;
    case 'buffMana':
      fighter.mana = Math.min(3, fighter.mana + stats.primary!);
      fighter.shield = { kind: 'mana', reduction: stats.secondary! };
      break;
    case 'buffHaste': {
      // Chrono's Haste. Drags an ally's pawn back *up* the clock toward the marker so they are
      // visited sooner — the mirror image of every boss effect that pushes pawns down. Capped at
      // marker-1 so it can never place a pawn on or above the marker, which would either skip the
      // ally's visit entirely or re-trigger one the marker has already passed.
      const target = battle.fighters.find((f) => f.playerId === choice.targetPlayerId);
      if (!target || !target.alive || target.playerId === fighter.playerId) {
        throw new Error(`illegal Haste target ${choice.targetPlayerId} for player ${fighter.playerId} (must be a different, living ally)`);
      }
      const moved = Math.min(battle.marker - 1, target.slot + (stats.primary ?? 0));
      if (moved > target.slot) {
        target.slot = moved;
        target.stackSeq = battle.nextStackSeq++;
        // chrono2 reads this on the ally's next visit, then clears it.
        target.hastedByPlayerId = fighter.playerId;
        battle.log.push({ t: 'HASTED', playerId: fighter.playerId, targetId: target.playerId, slot: moved });
      }
      break;
    }
    case 'buffStealth': {
      // Kage's Smoke Bomb. Hides him *and everyone sharing his slot* — which is the mechanical
      // reason his size is small: small fighters may always stack onto an occupied slot, so he can
      // choose who the smoke covers by choosing where to stand.
      const until = battle.marker - (stats.secondary ?? 4);
      for (const f of battle.fighters) {
        // The caster is always covered, even though his own pawn has already walked off
        // declaredFromSlot by the time this runs — the smoke is thrown from where he was standing.
        const shared = f.playerId === fighter.playerId || f.slot === declaredFromSlot;
        if (!f.alive || !shared) continue;
        f.stealthUntilSlot = until;
        f.stealthStrikeBonus = stats.primary ?? 0;
        battle.log.push({ t: 'STEALTH_ENTERED', playerId: f.playerId, expiresAtSlot: until });
      }
      break;
    }
    case 'raise': {
      // Morvane's Raise Dead. Buys back the ~6 slots of missing pawn-visits a downed ally costs the
      // party, which is why a card that deals no damage still clears §8.0's "must touch the damage
      // economy" bar — it is the most direct damage restoration in the game.
      const target = battle.fighters.find((f) => f.playerId === choice.targetPlayerId);
      if (!target || target.alive || target.playerId === fighter.playerId) {
        throw new Error(`illegal Raise Dead target ${choice.targetPlayerId} (must be a downed ally)`);
      }
      reviveFighterNow(state, target, stats.primary ?? 50);
      pushScore(state, { playerId: fighter.playerId, conditionId: 'morvane2', points: scorePoints('morvane2') });
      break;
    }
    case 'rewind': {
      // Chrono's Rewind — the only card in the game that touches the clock marker.
      //
      // Safe by construction: every pawn is always at or below the marker, so walking the marker
      // *up* cannot step over one and re-trigger it. Nothing is re-run; the runway simply gets
      // longer. He pays ⏱6 and SAND_PER_REWIND to hand `primary` slots to all four seats.
      fighter.sand -= SAND_PER_REWIND;
      const slots = stats.primary ?? 3;
      battle.marker = Math.min(CLOCK_TOP_SLOT, battle.marker + slots);
      battle.log.push({ t: 'MARKER_REWOUND', playerId: fighter.playerId, slots, marker: battle.marker });
      break;
    }
    case 'guard':
      // Declare-immediate (docs/RULINGS.md §5 group B): the protection has to be up *before* the
      // boss's already-announced move lands, or reading the boss — the whole point of §4.4 — would
      // buy Eric nothing. Only one link can exist at a time; a second Guard replaces the first.
      battle.guard = {
        guardianId: fighter.playerId,
        wardId: choice.targetPlayerId!,
        reduction: stats.primary ?? 0,
      };
      break;
    case 'trap': {
      // Validated rather than trusted: the choice comes from a UI or a bot, and an out-of-window
      // slot would silently hand that player the pre-v0.3.0.2 "arm it anywhere" power.
      const legal = legalTrapSlots(state, fighter);
      if (choice.trapSlot == null || !legal.includes(choice.trapSlot)) {
        throw new Error(
          `illegal Trap slot ${choice.trapSlot} for player ${fighter.playerId} at marker ${battle.marker} (legal: ${legal.join(',') || 'none'})`
        );
      }
      battle.traps.push({ slot: choice.trapSlot, dmg: stats.primary!, ownerId: fighter.playerId });
      break;
    }
    case 'attackMana':
      // Mana is paid up front and never refunded, even if the attack later fizzles (§5.1/§8).
      fighter.mana = Math.max(0, fighter.mana - (choice.manaSpent ?? 0));
      break;
    case 'multiHit':
      // Multi Shot: the primary hit resolves normally through fighter.pending at landedAtSlot; the
      // earlier hits are scheduled right now and fire when the marker reaches them
      // (processScheduledHitsAtMarker) — but only if this fighter is still alive at that moment.
      // Dying mid-flight stops the remaining hits dead, same as the primary (killFighter already
      // clears fighter.pending, which is what stops that one).
      for (const eh of stats.earlyHits ?? []) {
        battle.scheduledHits.push({ slot: battle.marker - eh.offset, dmg: eh.dmg, ownerId: fighter.playerId, skillId });
      }
      break;
  }

  // v0.4.1: skills marked `immediate` (@content/characters) deal their damage — and, for Sharp
  // Shooting, roll their weak-point check — right here, instead of waiting for this fighter's next
  // visit. The pawn still walks its full ⏱ exactly as set up above; only *when the damage lands*
  // changes. Flagging the pending as resolved tells resolveFighterPending there's nothing left to
  // do when this fighter is next visited — it just frees the pawn.
  if (def.immediate) {
    if (def.kind === 'attack') resolveAttackHits(state, fighter, skillId, stats, def);
    else if (def.kind === 'attackRoll') resolveAttackRoll(state, fighter, skillId, stats, rng);
    fighter.pending.resolved = true;
  }

  // Liora's ManaCharge passive (@content/characters PASSIVES.Liora): declaring any of her own
  // non-damaging actions (Aura Charge is currently the only one) grants +1 mana, cap 3. Kept
  // separate from Aura Charge's own `buffMana` handling above (its primary is 0) so the passive
  // reads as what it is — an always-on trait, not a property baked into one specific card.
  const DAMAGING_KINDS = new Set(['attack', 'attackGated', 'attackRoll', 'attackMana', 'multiHit']);
  if (fighter.charId === 'Liora' && !DAMAGING_KINDS.has(def.kind)) {
    fighter.mana = Math.min(3, fighter.mana + 1);
  }
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
  if (pending.resolved) {
    // Already applied immediately at declare (a skill marked `immediate` — see declareSkill) —
    // nothing left to do but free the pawn for its next declare.
    fighter.pending = null;
    return;
  }
  const skillId = pending.skillId;
  const def = SKILLS[skillId];
  const stats = skillStats(skillId, isLv2(state, fighter, skillId));

  const dealAttack = (rawBase: number, ignoresArmor: boolean) => dealAttackFor(state, fighter, skillId, rawBase, ignoresArmor);

  switch (def.kind) {
    case 'attack': {
      resolveAttackHits(state, fighter, skillId, stats, def, pending.payHp === true);
      break;
    }
    case 'attackGated': {
      // Slash: the HP<=5 tier is re-checked here, at resolve, so it reflects the damage Eric has
      // actually taken while the swing was in flight — including a Luna heal that pulls him back
      // above the line. The action never fizzles now (v0.3.2); it just lands for the lower number.
      const boosted = fighter.hp <= ATTACK_GATED_HP_THRESHOLD && stats.secondary != null;
      dealAttack(boosted ? stats.secondary! : stats.primary!, false);
      break;
    }
    case 'attackRoll': {
      resolveAttackRoll(state, fighter, skillId, stats, rng);
      break;
    }
    case 'attackMana': {
      const manaSpent = pending.manaSpent ?? 0;
      const base = stats.primary! + stats.secondary! * manaSpent;
      // manaSpent is forwarded so liora2 ("fully charged cast") can see how much she committed.
      dealAttackFor(state, fighter, skillId, base, false, manaSpent);
      break;
    }
    case 'multiHit': {
      // The primary hit only — the two earlier hits already fired via scheduledHits (declareSkill).
      dealAttack(stats.primary!, false);
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
      // Blessing has its own fixed four-slot clock lifetime. Normally it already expired before
      // Luna is revisited; retain this owner check only as a safe fallback for hand-built states.
      if (battle.partyBuff?.ownerId === fighter.playerId && battle.marker <= battle.partyBuff.expiresAtSlot) {
        battle.partyBuff = null;
      }
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
/** Clears traps the marker has reached without the boss stopping on them. The *trigger* no longer
 *  lives here: since v0.3.15 a trap fires inside the boss's own action (springTrapOnBoss below), so
 *  that it can interrupt a move the boss has already rolled. All this does now is expire the misses. */
export function processTrapsAtMarker(state: GameState) {
  const battle = state.battle!;
  const here = battle.traps.filter((t) => t.slot === battle.marker);
  if (here.length === 0) return;
  if (battle.bossSlot === battle.marker) return; // the boss is standing on it — springTrapOnBoss has it
  battle.traps = battle.traps.filter((t) => t.slot !== battle.marker);
  for (const trap of here) battle.log.push({ t: 'RESOLVE_TRAP_EXPIRE', slot: trap.slot });
}

/** Springs any trap the boss is standing on, called from declareBossAction *after* the boss has
 *  rolled its move but *before* that move resolves. Returns true if the move was cancelled.
 *
 *  v0.3.15: back to cancelling, which is where this started — but it means something different now.
 *  The pre-v0.3.9 cancel was weak because the boss's pawn never moved, so it simply declared a fresh
 *  move on the spot and lost only that one roll. v0.3.9 swapped it for a delay to get real tempo
 *  denial. Since v0.3.14 the boss acts and *then* walks its cooldown, so a cancel here costs it the
 *  whole action while it still pays the full ⏱ — the strongest version of the card yet, and the only
 *  one where the fantasy reads correctly: the hunter's snare closes on the beast mid-lunge.
 *
 *  The move is rolled before the trap is, so the table learns what it just stopped. That is the one
 *  place in v0.3.14's design where the boss's intent becomes public, and Kit is the one who buys it. */
export function springTrapOnBoss(state: GameState, rng: RNG): boolean {
  const battle = state.battle!;
  const trap = battle.traps.find((t) => t.slot === battle.marker);
  if (!trap) return false;
  battle.traps = battle.traps.filter((t) => t !== trap);

  // Springing it is automatic; whether it actually cuts is a roll (Kit's Skill Improvement passive,
  // not the old per-battle ladder). A miss means no damage AND no cancel — it fired too weakly.
  const owner = battle.fighters.find((f) => f.playerId === trap.ownerId)!;
  if (!rollLadder(state, owner, 'Trap', 'Trap trigger', rng)) {
    battle.log.push({ t: 'RESOLVE_TRAP_TRIGGER', slot: trap.slot, dmg: 0, ownerId: trap.ownerId });
    return false;
  }

  const result = applyDamageToBoss(state, trap.ownerId, trap.dmg, { ignoresArmor: true, skillId: 'Trap', countsAsAttack: false });
  battle.log.push({ t: 'RESOLVE_TRAP_TRIGGER', slot: trap.slot, dmg: result.effective, ownerId: trap.ownerId });
  onTrapTriggered(state, trap.ownerId);
  return true;
}

/** Expires fixed-duration effects before anything at this marker can use them. Blessing declared at
 *  slot N is active for the next four clock steps and is gone when the marker reaches N-4. */
export function expireTimedEffectsAtMarker(state: GameState) {
  const battle = state.battle!;
  if (battle.partyBuff && battle.marker <= battle.partyBuff.expiresAtSlot) battle.partyBuff = null;
  // v0.4.0 stealth runs on the same slot-counted timer as everything else here.
  for (const f of battle.fighters) {
    if (f.stealthUntilSlot != null && battle.marker <= f.stealthUntilSlot) {
      f.stealthUntilSlot = null;
      f.stealthStrikeBonus = 0;
      battle.log.push({ t: 'STEALTH_BROKEN', playerId: f.playerId });
    }
  }
  if (battle.weakPoint && battle.marker <= battle.weakPoint.expiresAtSlot) battle.weakPoint = null;
}

/** Multi Shot's early hits (kind: 'multiHit', @content/characters): fired the instant the marker
 *  reaches their scheduled slot — no roll and no boss-position requirement. killFighter removes all
 *  remaining hits immediately, so this alive check is defense-in-depth for malformed/resumed state.
 *  Runs alongside processTrapsAtMarker every tick, before that slot's visit queue. */
export function processScheduledHitsAtMarker(state: GameState) {
  const battle = state.battle!;
  const here = battle.scheduledHits.filter((h) => h.slot === battle.marker);
  if (here.length === 0) return;
  battle.scheduledHits = battle.scheduledHits.filter((h) => h.slot !== battle.marker);
  for (const h of here) {
    if (battle.outcome !== 'in_progress') break;
    const owner = battle.fighters.find((f) => f.playerId === h.ownerId);
    if (!owner || !owner.alive) {
      battle.log.push({ t: 'RESOLVE_ATTACK', playerId: h.ownerId, skillId: h.skillId, targetId: 'boss', dmg: 0, wasted: true });
      continue;
    }
    const outgoing = computeOutgoingPlayerDamage(battle, h.dmg, h.ownerId);
    const result = applyDamageToBoss(state, h.ownerId, outgoing, { ignoresArmor: false, skillId: h.skillId });
    onPlayerDealtDamage(state, h.ownerId, h.skillId, result.effective);
    battle.log.push({ t: 'RESOLVE_ATTACK', playerId: h.ownerId, skillId: h.skillId, targetId: 'boss', dmg: result.effective, wasted: false });
  }
}

/** Where damage aimed at `fighter` actually lands, after Eric's Guard. Returns the ward's guardian
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
  rawDamage: number,
  opts: { piercesPartyMitigation?: boolean } = {}
): { applied: number; counterDmg: number; recipient: Fighter } {
  const { recipient, reduction } = redirectTarget(state, fighter);
  // kage3 ("never hit all battle") and his Shadowless passive both hang off this one fact, so it is
  // latched at the single point every boss-sourced hit passes through. Recorded before mitigation:
  // being hit for 0 through a shield still counts as having been hit.
  if (rawDamage > 0) {
    recipient.everHitByBossThisBattle = true;
    recipient.shadow = 0;
  }
  // Read before applying: dying clears the shield.
  const counterDmg = recipient.shield?.kind === 'counter' ? recipient.shield.counterDmg ?? 0 : 0;
  // Scored before the damage lands, so a hit that kills the guardian still counts as protection
  // delivered — he did take it for them. Only a genuine incoming hit counts (rawDamage > 0), and
  // only when Guard actually moved it off someone else.
  if (recipient.playerId !== fighter.playerId && rawDamage > 0) {
    onGuardRedirected(state, recipient.playerId);
  }
  const applied = applyDamageToFighter(state, recipient, Math.max(0, rawDamage - reduction), opts);
  return { applied, counterDmg, recipient };
}

/** Resolves one fighter's counter-strike queued by `applyBossDamageToFighter` above, against the
 *  boss. Fires even if the fighter has since died on the same hit — Counter exists to punish the
 *  boss's biggest attacks, which are exactly the ones that might kill the fighter landing it. */
export function resolveQueuedCounter(state: GameState, fighter: Fighter, counterDmg: number) {
  const battle = state.battle!;
  if (counterDmg <= 0 || battle.outcome !== 'in_progress') return;
  // Each character has at most one buffCounter-kind skill in their kit — look up which one this
  // fighter actually has (Eric's Counter Attack, Dax's Riposte, ...) instead of assuming Eric's.
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
  rawDamage: number,
  opts: { piercesPartyMitigation?: boolean } = {}
): { applied: number; recipient: Fighter } {
  const { applied, counterDmg, recipient } = applyBossDamageToFighter(state, fighter, rawDamage, opts);
  resolveQueuedCounter(state, recipient, counterDmg);
  return { applied, recipient };
}
