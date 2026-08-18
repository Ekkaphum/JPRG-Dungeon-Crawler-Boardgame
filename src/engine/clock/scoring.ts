// Score-condition triggers (GAME_DESIGN_v0_3_0.md §6/§8) + EXP/point payout (§7.1) + winner
// determination (§1). "Per-occurrence" conditions fire live from inside skills.ts/bossAI.ts the
// instant they happen; the "slot 3" end-of-battle conditions are checked once here after a boss
// dies.

import { KIT3_HITS_PER_POINT, LAST_SHOT_CONDITION_ID, LAST_SHOT_POINTS, VERA_BIG_HIT_DAMAGE, VERA_CHARGED_CAST_MANA, scorePoints, type SkillId } from '@content/characters';
import { pushScore, currentTotalScore } from './damage';
import type { GameState, PlayerId } from './types';

// A 6-character roster drafted 4-at-a-table (2026-08-11) means any single character, Luna
// included, may simply not be in a given game — this must never assume otherwise and throw.
function playerByChar(state: GameState, charId: string): PlayerId | null {
  return state.players.find((p) => p.charId === charId)?.id ?? null;
}

/** Eric cond1 (dmg>10), Liora cond1 (dmg>=14), Luna cond2 (blessed ally dmg>15), and both
 *  characters' "Last Shot" bonuses — called right after any player-sourced hit on the boss
 *  resolves (not for trap damage, which has no attributable "player action"). Point values live in
 *  @content/characters (scorePoints()) — this is only the trigger logic, not the numbers. */
export function onPlayerDealtDamage(state: GameState, playerId: PlayerId, skillId: SkillId, effectiveDmg: number, manaSpent = 0) {
  const battle = state.battle!;
  const charId = state.players.find((p) => p.id === playerId)!.charId;

  if (charId === 'Eric' && effectiveDmg > 10) {
    pushScore(state, { playerId, conditionId: 'matt1', points: scorePoints('matt1') });
  }
  if (charId === 'Liora' && effectiveDmg >= VERA_BIG_HIT_DAMAGE) {
    pushScore(state, { playerId, conditionId: 'vera1', points: scorePoints('vera1') });
  }
  // vera3's half: her signature spell actually went off this battle. Keyed on Meteor connecting
  // rather than on any big hit — a fully-charged Fireball can clear vera1's damage bar, but only
  // Meteor is the ⏱7 wind-up the whole "protect me while I cast" fantasy is about.
  if (charId === 'Liora' && skillId === 'Meteor' && effectiveDmg > 0) {
    const f = battle.fighters.find((x) => x.playerId === playerId);
    if (f) f.landedMeteorThisBattle = true;
  }
  if (battle.partyBuff && effectiveDmg > 15) {
    // Guarded rather than assumed safe: only Luna's own Blessing can set partyBuff, so this is
    // unreachable when she isn't drafted in practice — but "unreachable in practice" is exactly
    // how playerByChar's crash on a missing Luna slipped in undetected until Mira exposed it.
    const lunaId = playerByChar(state, 'Luna');
    if (lunaId !== null) pushScore(state, { playerId: lunaId, conditionId: 'luna2', points: scorePoints('luna2') });
  }
  // Universal Last Shot bonus (v0.3.7) — every character, not just Eric and Liora as before. Fires
  // here rather than in onBattleEndScoring so it lands on the exact hit that killed the boss, which
  // is also what makes it correct when the killing blow comes from a trap or a counter-strike.
  if (battle.finishedBy === playerId) {
    pushScore(state, { playerId, conditionId: LAST_SHOT_CONDITION_ID, points: LAST_SHOT_POINTS });
  }
  // vera2: a charged cast that actually connected. manaSpent lives on the pending action, so the
  // caller passes it through — see resolveFighterPending's attackMana branch. The bar is 2, not the
  // full 3: mana only ever comes from spending a whole turn on Aura Charge, and a measured 3,000-game
  // sim at 3 fired the condition exactly 0.00 times per win — nobody ever banks three turns' worth
  // before casting, so the condition was dead on arrival.
  if (charId === 'Liora' && manaSpent >= VERA_CHARGED_CAST_MANA && effectiveDmg > 0) {
    pushScore(state, { playerId, conditionId: 'vera2', points: scorePoints('vera2') });
  }
  // kit1 (v0.3.16): Kit is paid every time the weak point he opened actually connects — by anyone,
  // himself included. v0.3.15 tried this allies-only under the id 'kit2' (to keep it separate from
  // the "open it" payout, which lived at 'kit1'); this version drops both restrictions at once —
  // opening no longer pays on its own, only cashing it in does, and it no longer matters who cashes
  // it. The Sharp Shooting hit that *opens* the window is unaffected: dealAttackFor for that hit
  // resolves before battle.weakPoint is set (see resolveAttackRoll in skills.ts), so it can never
  // credit itself here — only hits that land *after* the window is already open do.
  if (battle.weakPoint && effectiveDmg > 0) {
    const opener = state.players.find((p) => p.id === battle.weakPoint!.ownerId);
    if (opener?.charId === 'Kit') {
      pushScore(state, { playerId: battle.weakPoint.ownerId, conditionId: 'kit1', points: scorePoints('kit1') });
    }
  }
  if (charId === 'Mira' && skillId === 'FrostBolt' && effectiveDmg > 10) {
    pushScore(state, { playerId, conditionId: 'mira2', points: scorePoints('mira2') });
  }
  // Riposte's counter-strike used to always log as skillId 'CounterAttack' regardless of which
  // buffCounter skill actually fired (see dealDamageToFighterFromBoss in skills.ts) — fixed
  // alongside adding Dax, since a wrongly-attributed hit here would have made this condition
  // unreachable rather than just cosmetically mislabeled.
  if (charId === 'Dax' && skillId === 'Riposte' && effectiveDmg > 0) {
    pushScore(state, { playerId, conditionId: 'dax2', points: scorePoints('dax2') });
  }
}

/** Which character's weak-point-opener condition this is — Kit's Quick Shot and Dax's Focus both
 *  resolve through the same generic attackRoll success path (skills.ts), so the condition to
 *  credit has to be looked up by character rather than assumed. */
export function onWeakPointOpened(state: GameState, playerId: PlayerId) {
  // v0.3.16 first cut moved kit1 entirely onto the hits that cash the window in (onPlayerDealtDamage
  // below), on the theory that opening a window nobody then hits into is a wasted turn and should not
  // pay for itself. Measured effect was bigger than intended: kit1 dropped from 4.18 pts/win (the old
  // open-pays-1 + ally-hits-pays-1 split) to 2.35, because a 4-slot window rarely sees more than ~1.4
  // hits land — and doubling kit2 (Trap) afterwards barely moved Kit at all, since Trap's own
  // frequency is the bottleneck, not its point value (0.06 -> still ~0.06 fires/win). Restored here:
  // opening pays again, on top of — not instead of — the hit-based payout, so kit1 now double-dips
  // the way it effectively did before v0.3.16, just consolidated under one id.
  const charId = state.players.find((p) => p.id === playerId)!.charId;
  const conditionId = charId === 'Kit' ? 'kit1' : charId === 'Dax' ? 'dax1' : null;
  if (conditionId) pushScore(state, { playerId, conditionId, points: scorePoints(conditionId) });
}

/** kit2 (v0.3.16): Trap actually triggers — the roll passed, so it dealt damage and cancelled the
 *  boss's move. Restored after v0.3.15 repointed kit2 onto the weak point and left Trap without a
 *  score condition of its own; springTrapOnBoss (skills.ts) calls this only on a passed roll. */
export function onTrapTriggered(state: GameState, ownerId: PlayerId) {
  pushScore(state, { playerId: ownerId, conditionId: 'kit2', points: scorePoints('kit2') });
}

/** matt2 (v0.3.7): Eric's Guard actually absorbed a hit that was aimed at an ally. Fires on the
 *  redirect itself, not on the damage that survives Guard's reduction — soaking a hit down to 0 is
 *  Guard working perfectly and must not score less than soaking it badly (same reasoning as Counter
 *  Attack's "นับแม้ดาเมจที่เข้าจริงจะเป็น 0" rule). Looked up by character rather than assumed, since
 *  a future character could own a guard-kind skill without owning matt2. */
export function onGuardRedirected(state: GameState, guardianId: PlayerId) {
  const charId = state.players.find((p) => p.id === guardianId)?.charId;
  if (charId !== 'Eric') return;
  pushScore(state, { playerId: guardianId, conditionId: 'matt2', points: scorePoints('matt2') });
}

/** Same character-lookup reasoning as onWeakPointOpened: Luna's Heal and Mira's Mending Wind both
 *  resolve through the same generic heal-kind path. */
export function onHealResolved(state: GameState, healerId: PlayerId, targetId: PlayerId, actualAmount: number) {
  if (actualAmount < 1) return;
  const charId = state.players.find((p) => p.id === healerId)!.charId;
  // Luna's condition explicitly says “heal a friend”: self-healing is legal and restores HP, but
  // does not award luna1. Mira's separate condition does not contain that restriction.
  if (charId === 'Luna' && targetId === healerId) return;
  // v0.3.15: Luna's luna1 moved off Heal entirely (see @content/characters) — healing is still her
  // job, it just is not what her card pays for any more. Mira keeps the heal-based version.
  const conditionId = charId === 'Mira' ? 'mira1' : null;
  if (conditionId) pushScore(state, { playerId: healerId, conditionId, points: scorePoints(conditionId) });
}

/** "Slot 3" end-of-battle conditions — only meaningful when the boss was actually defeated. */
export function onBattleEndScoring(state: GameState) {
  const battle = state.battle!;
  if (battle.outcome !== 'boss_defeated') return;

  for (const p of state.players) {
    const f = battle.fighters.find((x) => x.playerId === p.id)!;
    // v0.3.7 matt3: took the beating and never went down. Uses the latched
    // everDroppedBelowHalfThisBattle rather than his HP right now, so being healed back up after
    // surviving a mauling still scores — the old "HP < 5 at the final frame" version fired 0.13
    // times per win and pulled against Berserk.
    if (p.charId === 'Eric' && !f.everDiedThisBattle && f.everDroppedBelowHalfThisBattle) {
      pushScore(state, { playerId: p.id, conditionId: 'matt3', points: scorePoints('matt3') });
    }
    // kit3 (v0.3.15): pays per KIT3_HITS_PER_POINT attacks instead of once at a threshold. The 8+
    // bar was Kit's only real earner and it was capped at one payout a battle, so his best card
    // topped out at 6 points for the whole game while Eric's and Liora's repeatables had no ceiling
    // at all. Rewarding the rate rather than a single milestone also matches the fantasy the card
    // is named for — continuous fire — and it keeps paying when he beats the old bar by a lot.
    if (p.charId === 'Kit') {
      const points = Math.floor(f.attackCountThisBattle / KIT3_HITS_PER_POINT) * scorePoints('kit3');
      if (points > 0) pushScore(state, { playerId: p.id, conditionId: 'kit3', points });
    }
    // v0.3.7 vera3: surviving only pays if she also delivered the spell she was being protected for.
    if (p.charId === 'Liora' && !f.everDiedThisBattle && f.landedMeteorThisBattle) {
      pushScore(state, { playerId: p.id, conditionId: 'vera3', points: scorePoints('vera3') });
    }
    if (p.charId === 'Dax' && f.alive && f.hp > f.maxHp / 2) {
      pushScore(state, { playerId: p.id, conditionId: 'dax3', points: scorePoints('dax3') });
    }
    if (p.charId === 'Mira' && !f.everDiedThisBattle) {
      pushScore(state, { playerId: p.id, conditionId: 'mira3', points: scorePoints('mira3') });
    }
  }
  const noOneEverDied = battle.fighters.every((f) => !f.everDiedThisBattle);
  if (noOneEverDied) {
    // This one WAS reachable with Luna undrafted (a full-party-survives battle needs nothing from
    // her specifically) — playerByChar(state, 'Luna')!.id would throw here in a real game.
    const lunaId = playerByChar(state, 'Luna');
    if (lunaId !== null) pushScore(state, { playerId: lunaId, conditionId: 'luna3', points: scorePoints('luna3') });
  }
}

/** §7.1: defeating a boss grants EXP = floor(remaining slots / 2) equally to everyone, except the
 *  last boss, which converts the same formula into points instead. Returns the EXP granted (0 for
 *  the last-boss/points case) purely for UI/log display. */
export function grantEndOfBattleRewards(state: GameState): number {
  const battle = state.battle!;
  if (battle.outcome !== 'boss_defeated') return 0;
  const remaining = battle.marker;
  const isLastBoss = state.bossIndex === state.bossQueue.length - 1;
  if (isLastBoss) {
    const points = Math.floor(remaining / 2);
    for (const p of state.players) {
      pushScore(state, { playerId: p.id, conditionId: 'timeBonus', points });
    }
    return 0;
  }
  const exp = Math.floor(remaining / 2);
  for (const p of state.players) {
    state.progress[p.id].bankedExp += exp;
  }
  return exp;
}

export interface FinalScores {
  totals: Record<PlayerId, number>;
  winnerId: PlayerId;
  tieBreak: 'points' | 'lastShots' | 'hp' | 'none';
}

/** §1 winner rule: highest points → most Last Shots landed → highest HP at game end. */
export function determineWinner(state: GameState): FinalScores {
  const totals: Record<PlayerId, number> = {};
  for (const p of state.players) totals[p.id] = currentTotalScore(state, p.id);

  // §1: "จำนวนครั้งที่ตี Last Shot" — every character's kill counts, not just Eric's and
  // Liora's-via-Meteor's own point conditions (matt2/vera2), which only fire for a subset of Last
  // Shots and miss Kit, Luna, Dax, Mira, and Liora's other skills entirely. state.lastShotCounts is
  // tallied directly off battle.finishedBy at the end of every battle (walk.ts) for exactly this.
  const lastShotCounts: Record<PlayerId, number> = {};
  for (const p of state.players) {
    lastShotCounts[p.id] = state.lastShotCounts[p.id] ?? 0;
  }

  const finalHp: Record<PlayerId, number> = {};
  const lastBattleFighters = state.battle?.fighters ?? [];
  for (const p of state.players) {
    finalHp[p.id] = lastBattleFighters.find((f) => f.playerId === p.id)?.hp ?? 0;
  }

  const maxTotal = Math.max(...Object.values(totals));
  let contenders = state.players.map((p) => p.id).filter((id) => totals[id] === maxTotal);
  if (contenders.length === 1) return { totals, winnerId: contenders[0], tieBreak: 'points' };

  const maxLastShots = Math.max(...contenders.map((id) => lastShotCounts[id]));
  const afterLastShot = contenders.filter((id) => lastShotCounts[id] === maxLastShots);
  if (afterLastShot.length === 1) return { totals, winnerId: afterLastShot[0], tieBreak: 'lastShots' };

  const maxHp = Math.max(...afterLastShot.map((id) => finalHp[id]));
  const afterHp = afterLastShot.filter((id) => finalHp[id] === maxHp);
  return { totals, winnerId: afterHp[0], tieBreak: afterHp.length === 1 ? 'hp' : 'none' };
}
