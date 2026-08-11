// Score-condition triggers (GAME_DESIGN_v0_3_0.md §6/§8) + EXP/point payout (§7.1) + winner
// determination (§1). "Per-occurrence" conditions fire live from inside skills.ts/bossAI.ts the
// instant they happen; the "slot 3" end-of-battle conditions are checked once here after a boss
// dies.

import { scorePoints, type SkillId } from '@content/characters';
import { pushScore, currentTotalScore } from './damage';
import type { GameState, PlayerId } from './types';

function playerByChar(state: GameState, charId: string): PlayerId {
  return state.players.find((p) => p.charId === charId)!.id;
}

/** Matt cond1 (dmg>10), Vera cond1 (dmg>=15), Luna cond2 (blessed ally dmg>15), and both
 *  characters' "Last Shot" bonuses — called right after any player-sourced hit on the boss
 *  resolves (not for trap damage, which has no attributable "player action"). Point values live in
 *  @content/characters (scorePoints()) — this is only the trigger logic, not the numbers. */
export function onPlayerDealtDamage(state: GameState, playerId: PlayerId, skillId: SkillId, effectiveDmg: number) {
  const battle = state.battle!;
  const charId = state.players.find((p) => p.id === playerId)!.charId;

  if (charId === 'Matt' && effectiveDmg > 10) {
    pushScore(state, { playerId, conditionId: 'matt1', points: scorePoints('matt1') });
  }
  if (charId === 'Vera' && effectiveDmg >= 15) {
    pushScore(state, { playerId, conditionId: 'vera1', points: scorePoints('vera1') });
  }
  if (battle.partyBuff && effectiveDmg > 15) {
    pushScore(state, { playerId: playerByChar(state, 'Luna'), conditionId: 'luna2', points: scorePoints('luna2') });
  }
  if (battle.finishedBy === playerId) {
    if (charId === 'Matt') pushScore(state, { playerId, conditionId: 'matt2', points: scorePoints('matt2') });
    if (charId === 'Vera' && skillId === 'Meteor') pushScore(state, { playerId, conditionId: 'vera2', points: scorePoints('vera2') });
  }
}

export function onWeakPointOpened(state: GameState, playerId: PlayerId) {
  pushScore(state, { playerId, conditionId: 'kit1', points: scorePoints('kit1') });
}

export function onTrapTriggered(state: GameState, ownerId: PlayerId) {
  pushScore(state, { playerId: ownerId, conditionId: 'kit2', points: scorePoints('kit2') });
}

export function onHealResolved(state: GameState, healerId: PlayerId, actualAmount: number) {
  if (actualAmount >= 1) pushScore(state, { playerId: healerId, conditionId: 'luna1', points: scorePoints('luna1') });
}

/** "Slot 3" end-of-battle conditions — only meaningful when the boss was actually defeated. */
export function onBattleEndScoring(state: GameState) {
  const battle = state.battle!;
  if (battle.outcome !== 'boss_defeated') return;

  for (const p of state.players) {
    const f = battle.fighters.find((x) => x.playerId === p.id)!;
    if (p.charId === 'Matt' && f.alive && f.hp < 5) {
      pushScore(state, { playerId: p.id, conditionId: 'matt3', points: scorePoints('matt3') });
    }
    if (p.charId === 'Kit' && f.attackCountThisBattle >= 5) {
      pushScore(state, { playerId: p.id, conditionId: 'kit3', points: scorePoints('kit3') });
    }
    if (p.charId === 'Vera' && !f.everDiedThisBattle) {
      pushScore(state, { playerId: p.id, conditionId: 'vera3', points: scorePoints('vera3') });
    }
  }
  const noOneEverDied = battle.fighters.every((f) => !f.everDiedThisBattle);
  if (noOneEverDied) {
    pushScore(state, { playerId: playerByChar(state, 'Luna'), conditionId: 'luna3', points: scorePoints('luna3') });
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

  const lastShotCounts: Record<PlayerId, number> = {};
  for (const p of state.players) {
    lastShotCounts[p.id] = state.scoreLog.filter((e) => e.playerId === p.id && (e.conditionId === 'matt2' || e.conditionId === 'vera2')).length;
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
