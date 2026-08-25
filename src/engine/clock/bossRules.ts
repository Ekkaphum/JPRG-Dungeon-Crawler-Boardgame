// Standing rules the nine bosses added with the Seven Sins and Chess series impose on the *rest* of
// the engine — the ones that have to fire inside somebody else's pipeline rather than inside a boss
// action. Split out of bossAI.ts on purpose: damage.ts needs them, bossAI.ts needs them, and
// bossAI.ts already imports damage.ts. A shared leaf module that imports neither is the only shape
// that keeps that from becoming an import cycle.
//
// Everything here is a no-op for Ragorath, Somnivar and Aurelius, so the tuned three-boss game
// passes through untouched — by construction, not by testing.

import { applyDamageToFighter } from './damage';
import type { BattleState, Fighter, GameState, PlayerId } from './types';
import { BOSSES } from '@content/bosses';

// ── Mammorax, §3.7 ──
/** The pile he opens with. It is his armor, except that it can be taken off him. */
export const MAMMORAX_START_HOARD = 2;
export const MAMMORAX_HOARD_CAP = 5;
/** A single hit landing over this much prises gold loose. Deliberately above what chip damage can
 *  reach, which is the whole weakness: "หมัดใหญ่เท่านั้น". */
export const MAMMORAX_ROB_THRESHOLD = 10;
export const MAMMORAX_ROB_AMOUNT = 2;

// ── Gulvorax, §3.6 ──
/** Damage the party must put into him, counted from the swallow, to cut somebody back out. */
export const GULVORAX_FREE_DAMAGE = 15;
/** What an item used from *inside* him costs: this much HP, plus his entire next turn. */
export const GULVORAX_POISON_HP = 8;

// ── Levithar, §3.4 ──
export const LEVITHAR_SOLITUDE_SLOTS = 6;
export const LEVITHAR_SOLITUDE_HP = 6;
export const LEVITHAR_SOLITUDE_ENVY = 3;
export const LEVITHAR_ENVY_CAP = 12;

// ── Asmodeus, §3.8 ──
export const ASMODEUS_REFUSAL_HP = 10;

// ── The Pawn Rank, §4.3 ──
/** Ceiling on accumulated ranks. **Not on the sheet** — §4.3 lets them climb without limit, which
 *  on a 24-slot clock at ⏱2-3 per move reaches +15 damage by the end and turns the game's tutorial
 *  boss into its hardest (measured 55% clear where the tuned opener sits at 78%). Capped, the
 *  lesson survives — the number goes up every turn and you can only bring it down by shoving him
 *  backwards — while the fight stays winnable by playing well rather than by racing. */
export const PAWN_RANK_CAP = 4;

// ── Chess, §4.2 ──
export const CHESS_CAPTURE_DMG = 6;
export const CHESS_CAPTURE_PUSH = 3;

/** ⬛⬜ The clock is a chessboard (§4.2). Odd slots are black by default; the Bishop's Invert move
 *  swaps the definition, which is what turns every skill's printed ⏱ into a colour decision. */
export function isBlackSlot(battle: BattleState, slot: number): boolean {
  return (slot % 2 === 1) !== battle.colorFlipped;
}

/** Fighters the boss is allowed to aim at. Identical to "everyone alive" for every boss but
 *  Gulvorax, who cannot hit what he has already eaten — the swallowed player is off the board as
 *  far as targeting is concerned, which is what makes the belly a place rather than a debuff. */
export function targetableFighters(battle: BattleState): Fighter[] {
  return battle.fighters.filter((f) => f.alive && f.playerId !== battle.swallowedId);
}

export function isSwallowed(battle: BattleState, playerId: PlayerId): boolean {
  return battle.swallowedId === playerId;
}

/** 🍴 Gulvorax's battle tax: he eats half of every item the party spends (§3.6) — the gems they
 *  shopped with, turned into his dinner. The one exception is an item used from inside his belly,
 *  which is handled at the use site because it also poisons him. */
export function itemPotency(state: GameState, user: Fighter, raw: number): number {
  const battle = state.battle;
  if (!battle || battle.bossId !== 'Gulvorax') return raw;
  if (battle.swallowedId === user.playerId) return raw; // force-fed, and he regrets it
  return Math.floor(raw / 2);
}

/** Defensive modifiers a boss applies to incoming player damage, *before* armor. Returns the
 *  adjusted damage and whether armor should still be applied at all.
 *
 *  Two bosses use it, for opposite reasons: Mammorax's hoard is a second, stealable armor, and the
 *  Bishop's colour rule makes the same swing worth full-and-armor-piercing or half depending on
 *  which slot the attacker chose to stand on. */
export function applyBossDefence(
  battle: BattleState,
  attacker: Fighter | undefined,
  dmg: number,
  ignoresArmor: boolean
): { dmg: number; ignoresArmor: boolean } {
  if (battle.bossId === 'Mammorax' && battle.hoard > 0) {
    // Each gold cancels one point of damage, exactly as §3.7 prints it. What changed after
    // measurement is the *size of the pile*, not the rule: at the sheet's 8-rising-to-12 it ate
    // most of what the party could throw and the fight was unwinnable in 40/40 games. At 2 rising
    // to 5 it sits in the same band as Aurelius's armor — big enough that small hits are wasted,
    // small enough that two robbed gold is a visible dent in it, which is the whole fight.
    return { dmg: Math.max(0, dmg - battle.hoard), ignoresArmor };
  }
  if (battle.bossId === 'Bishop' && attacker) {
    // Standing in the light is safe and useless; standing in his shadow is where the fight is.
    return isBlackSlot(battle, attacker.slot)
      ? { dmg, ignoresArmor: true }
      : { dmg: Math.floor(dmg / 2), ignoresArmor };
  }
  return { dmg, ignoresArmor };
}

/** Everything that has to happen *after* effective damage lands on a boss. Kept as one call so
 *  damage.ts has a single line to make rather than a growing list of per-boss branches. */
export function onBossDamaged(state: GameState, attackerId: PlayerId, effective: number, raw = effective): void {
  const battle = state.battle!;
  if (effective <= 0) return;

  // Mammorax: only a big hit reaches past the pile to the pile itself. Measured against the blow as
  // *thrown* rather than as it lands, because the pile is what it has to punch through — reading
  // the post-hoard number meant a party had to clear the threshold twice over, the hoard never
  // shrank, and the fight's entire premise ("his defence is your payday") never happened.
  //
  // The robbed gold is paid out as real gems at the end of the battle (see gemsForPlayer), which is
  // why it is tracked on the fighter rather than as a single party total.
  if (battle.bossId === 'Mammorax' && raw > MAMMORAX_ROB_THRESHOLD && battle.hoard > 0) {
    const robbed = Math.min(MAMMORAX_ROB_AMOUNT, battle.hoard);
    battle.hoard -= robbed;
    const thief = battle.fighters.find((f) => f.playerId === attackerId);
    if (thief) thief.goldRobbedThisBattle += robbed;
    battle.log.push({ t: 'HOARD_ROBBED', playerId: attackerId, amount: robbed, hoard: battle.hoard });
  }

  // Gulvorax: cutting somebody out of him is paid for in damage that also counts against his HP —
  // "ไม่มีอะไรสูญเปล่า". The real price of the rescue is the turns the victim lost, not the damage.
  if (battle.bossId === 'Gulvorax' && battle.swallowedId !== null) {
    battle.swallowDamage += effective;
    if (battle.swallowDamage >= GULVORAX_FREE_DAMAGE) disgorge(state);
  }

  checkPhaseFlip(state);
}

/** Cuts the swallowed player free at the marker (§3.6). Safe to call with an empty belly. */
export function disgorge(state: GameState, toSlot?: number): void {
  const battle = state.battle!;
  if (battle.swallowedId === null) return;
  const victim = battle.fighters.find((f) => f.playerId === battle.swallowedId);
  const slot = Math.max(0, toSlot ?? battle.marker);
  battle.swallowedId = null;
  battle.swallowedTurns = 0;
  battle.swallowDamage = 0;
  if (victim) {
    victim.slot = slot;
    victim.stackSeq = battle.nextStackSeq++;
    battle.log.push({ t: 'DISGORGED', playerId: victim.playerId, toSlot: slot });
  }
}

/** §1.1 — the shared two-phase flip. Fires the instant a boss with a second sheet reaches half HP
 *  and never fires again, so healing back over the line does not put the crown back on.
 *
 *  The pawn jumping to the marker is what buys the "acts immediately" half of the rule; walk.ts
 *  sweeps for a boss pawn that has landed on the current marker after its queue was frozen. */
export function checkPhaseFlip(state: GameState): void {
  const battle = state.battle!;
  if (battle.phase !== 1) return;
  const def = BOSSES[battle.bossId];
  if (!def.phase2) return;
  if (battle.bossHp > Math.ceil(battle.bossHpMax / 2)) return;
  // A boss on 0 is dead, not uncrowned — the flip must never resurrect a finished fight.
  if (battle.bossHp <= 0 || battle.outcome !== 'in_progress') return;

  battle.phase = 2;
  // The accumulated armor and buffs go with the crown. This is the line that makes phase 2 a
  // different problem rather than a harder version of the same one: phase 1 asks how to get
  // through, phase 2 asks how fast.
  battle.armor = 0;
  battle.hoard = 0;
  battle.bossSlot = battle.marker;
  battle.bossStackSeq = battle.nextStackSeq++;
  battle.log.push({ t: 'BOSS_PHASE_2', bossId: battle.bossId });
}

/** Levithar's 🕊️ solitude, ticked once per clock slot from the walk loop. A whole stretch of the
 *  clock in which nobody buffed anybody starves him — which is the only weakness in the box that
 *  the party triggers by *not* playing well together. */
export function tickBossSlotRules(state: GameState): void {
  const battle = state.battle!;
  if (battle.bossId !== 'Levithar') return;
  battle.slotsSinceBuff += 1;
  if (battle.slotsSinceBuff < LEVITHAR_SOLITUDE_SLOTS) return;
  battle.slotsSinceBuff = 0;
  battle.bossHp = Math.max(0, battle.bossHp - LEVITHAR_SOLITUDE_HP);
  const before = battle.envy;
  battle.envy = Math.max(0, battle.envy - LEVITHAR_SOLITUDE_ENVY);
  battle.log.push({ t: 'ENVY_CHANGED', amount: battle.envy - before, total: battle.envy });
  // No finishedBy: nobody swung. A boss that starves to death is not anyone's last shot.
  if (battle.bossHp <= 0 && battle.outcome === 'in_progress') battle.outcome = 'boss_defeated';
}

/** Levithar's meter (§3.4): every buff a player receives **from somebody else** feeds him. Called
 *  from the one place in skills.ts where a buff actually lands on a fighter, so adding a new buff
 *  card never means remembering to come back here.
 *
 *  Self-buffs do not count, deliberately — the sin is envy of what the party gives each other, and
 *  counting a caster's own shield would tax simply taking a turn. */
export function onBuffReceived(state: GameState, target: Fighter, fromPlayerId: PlayerId): void {
  const battle = state.battle;
  if (!battle || target.playerId === fromPlayerId) return;
  target.buffsReceivedThisBattle += 1;
  if (battle.bossId !== 'Levithar') return;
  battle.slotsSinceBuff = 0;
  battle.envy = Math.min(LEVITHAR_ENVY_CAP * 2, battle.envy + 1);
  battle.log.push({ t: 'ENVY_CHANGED', amount: 1, total: battle.envy });
}

/** The Queen's summoned pawn tokens (§4.7). Anything standing on the slot the marker just reached
 *  takes the hit, and the token is spent — the same shape as Kit's trap, aimed the other way. */
export function processBossPawnsAtMarker(state: GameState): void {
  const battle = state.battle!;
  if (battle.bossPawns.length === 0) return;
  const here = battle.bossPawns.filter((p) => p.slot === battle.marker);
  if (here.length === 0) return;
  battle.bossPawns = battle.bossPawns.filter((p) => p.slot !== battle.marker);
  for (const token of here) {
    for (const f of battle.fighters) {
      if (!f.alive || f.slot !== battle.marker) continue;
      const dealt = applyDamageToFighter(state, f, token.dmg);
      battle.log.push({ t: 'RESOLVE_ATTACK', playerId: 'boss', skillId: 'BossMove', targetId: f.playerId, dmg: dealt, wasted: false });
    }
  }
}

/** ⏪ The Pawn Rank's weakness (§4.3): a pawn cannot retreat, so every shove backwards costs it a
 *  rank and makes it walk the whole road again. Called from each of the three places that can push
 *  the boss's pawn — Kit's trap, the grapnel item, and Liora's ❄️ Slow. */
export function onBossPushedBack(state: GameState): void {
  const battle = state.battle;
  if (!battle || battle.bossId !== 'PawnRank') return;
  battle.pawnRank = Math.max(0, battle.pawnRank - 1);
}
