import { describe, it, expect } from 'vitest';
import { prepareBattle, killFighter, reviveFighter, onBattleEndScoring, grantEndOfBattleRewards, determineWinner, currentTotalScore } from '@engine/index';
import { fixedDraftState } from './testUtils';

function findFighter(state: ReturnType<typeof fixedDraftState>, charId: string) {
  const player = state.players.find((p) => p.charId === charId)!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

describe("Luna cond3 — 'no one ever died' (§5.4: revived still counts as having died)", () => {
  it('does NOT grant Luna cond3 if someone died and was revived before the battle ended', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    const matt = findFighter(state, 'Matt');
    killFighter(state, matt);
    reviveFighter(state, matt);
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    const lunaScore = state.scoreLog.filter((e) => e.playerId === luna.playerId && e.conditionId === 'luna3');
    expect(lunaScore).toHaveLength(0);
  });

  it('grants Luna cond3 when truly nobody died', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    const lunaScore = state.scoreLog.filter((e) => e.playerId === luna.playerId && e.conditionId === 'luna3');
    expect(lunaScore).toHaveLength(1);
    expect(lunaScore[0].points).toBe(3);
  });
});

describe('Matt/Kit/Vera slot-3 end-of-battle conditions', () => {
  it('matt3: alive and HP < 5 at battle end', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    matt.hp = 3;
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.playerId === matt.playerId && e.conditionId === 'matt3')).toBe(true);
  });

  it('kit3: attacked the boss 5+ times this battle', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    kit.attackCountThisBattle = 5;
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.playerId === kit.playerId && e.conditionId === 'kit3')).toBe(true);
  });

  it('vera3: never died this battle (dying and reviving still disqualifies)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    killFighter(state, vera);
    reviveFighter(state, vera);
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.playerId === vera.playerId && e.conditionId === 'vera3')).toBe(false);
  });
});

describe('§7.1 EXP vs points payout', () => {
  it('grants EXP to everyone equally after a non-final boss', () => {
    const state = fixedDraftState();
    prepareBattle(state); // bossIndex 0
    state.battle!.marker = 10;
    state.battle!.outcome = 'boss_defeated';
    const exp = grantEndOfBattleRewards(state);
    expect(exp).toBe(5); // floor(10/2)
    for (const p of state.players) expect(state.progress[p.id].bankedExp).toBe(5);
  });

  it('converts to points instead of EXP after the last boss', () => {
    const state = fixedDraftState();
    state.bossIndex = 2; // Aurelius, the last boss
    prepareBattle(state);
    state.battle!.marker = 8;
    state.battle!.outcome = 'boss_defeated';
    const exp = grantEndOfBattleRewards(state);
    expect(exp).toBe(0);
    for (const p of state.players) {
      expect(state.progress[p.id].bankedExp).toBe(0);
      expect(state.scoreLog.some((e) => e.playerId === p.id && e.conditionId === 'timeBonus' && e.points === 4)).toBe(true);
    }
  });
});

describe('winner determination — points → Last Shots → HP (§1)', () => {
  it('breaks a point tie by counting Last Shot bonuses', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const kit = findFighter(state, 'Kit');
    // Equal 4-point totals, but only Matt's includes a Last Shot (matt2) entry.
    state.scoreLog.push({ playerId: matt.playerId, conditionId: 'matt1', points: 1, atSlot: 10, bossId: 'Ragorath' });
    state.scoreLog.push({ playerId: matt.playerId, conditionId: 'matt2', points: 3, atSlot: 10, bossId: 'Ragorath' });
    for (let i = 0; i < 4; i++) {
      state.scoreLog.push({ playerId: kit.playerId, conditionId: 'kit1', points: 1, atSlot: 10, bossId: 'Ragorath' });
    }
    expect(currentTotalScore(state, matt.playerId)).toBe(4);
    expect(currentTotalScore(state, kit.playerId)).toBe(4);
    const result = determineWinner(state);
    expect(result.winnerId).toBe(matt.playerId);
    expect(result.tieBreak).toBe('lastShots');
  });
});
