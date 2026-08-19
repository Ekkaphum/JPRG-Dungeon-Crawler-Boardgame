import { describe, it, expect } from 'vitest';
import { prepareBattle, killFighter, reviveFighter, onBattleEndScoring, grantEndOfBattleRewards, determineWinner, currentTotalScore } from '@engine/index';
import { fixedDraftState, setPlayerCharacter } from './testUtils';

function findFighter(state: ReturnType<typeof fixedDraftState>, charId: string) {
  const player = state.players.find((p) => p.charId === charId)!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

describe("Luna cond3 — 'no one ever died' (§5.4: revived still counts as having died)", () => {
  it('does NOT grant Luna cond3 if someone died and was revived before the battle ended', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    const matt = findFighter(state, 'Eric');
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
    expect(lunaScore[0].points).toBe(3); // 2 -> 3 in v0.3.16 (her one spike card, see characters.ts)
  });

  it('does not crash when Luna simply is not in the game (regression: playerByChar used to assume she always was)', () => {
    // A roster larger than the table means any single character, Luna included, may go undrafted in
    // a real game. onBattleEndScoring's luna3 check called `playerByChar(state, 'Luna')!.id`
    // unconditionally — a party that wins without Luna at the table would have crashed the instant
    // nobody died. Swap her out entirely and confirm the win still scores cleanly.
    const state = fixedDraftState();
    setPlayerCharacter(state, 3, 'Kage'); // player 3 was Luna
    prepareBattle(state);
    state.battle!.outcome = 'boss_defeated';
    expect(() => onBattleEndScoring(state)).not.toThrow();
    expect(state.scoreLog.some((e) => e.conditionId === 'luna3')).toBe(false);
  });
});

describe('Eric/Kit/Liora slot-3 end-of-battle conditions (v0.3.7)', () => {
  const scored = (state: ReturnType<typeof fixedDraftState>, playerId: number, conditionId: string) =>
    state.scoreLog.some((e) => e.playerId === playerId && e.conditionId === conditionId);

  it('eric3: dropped below half HP at some point and never died', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');
    matt.everDroppedBelowHalfThisBattle = true;
    matt.hp = matt.maxHp; // healed all the way back — the condition is about history, not final HP
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(scored(state, matt.playerId, 'eric3')).toBe(true);
  });

  it('eric3: does NOT fire if he never dropped below half, however low he ends', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');
    matt.hp = 3; // low now, but the latch was never set — he was never actually beaten down
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(scored(state, matt.playerId, 'eric3')).toBe(false);
  });

  it('eric3: does NOT fire if he died, even after reviving', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');
    matt.everDroppedBelowHalfThisBattle = true;
    killFighter(state, matt);
    reviveFighter(state, matt);
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(scored(state, matt.playerId, 'eric3')).toBe(false);
  });

  it('kit3: attacked the boss 8+ times this battle (bar raised from 5)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    kit.attackCountThisBattle = 8;
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(scored(state, kit.playerId, 'kit3')).toBe(true);
    // v0.3.15: 1 point per 4 attacks, so 8 pays the same 2 the old "8 or more" bar did.
    expect(state.scoreLog.find((e) => e.conditionId === 'kit3')?.points).toBe(2);
  });

  it('kit3 (v0.3.15): beating the bar by a lot now pays for it', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    kit.attackCountThisBattle = 15; // 3 full brackets of 4, remainder does not round up
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.find((e) => e.conditionId === 'kit3')?.points).toBe(3);
  });

  it('kit3: fewer than 4 attacks still pays nothing', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    kit.attackCountThisBattle = 3;
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(scored(state, kit.playerId, 'kit3')).toBe(false);
  });

  it('liora3: survived AND landed a 14+ damage hit', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Liora');
    vera.landedMeteorThisBattle = true;
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(scored(state, vera.playerId, 'liora3')).toBe(true);
  });

  it('liora3: surviving alone is no longer enough without a big hit', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Liora');
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(scored(state, vera.playerId, 'liora3')).toBe(false);
  });

  it('liora3: a banked big hit does not save it if she died (revived still disqualifies)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Liora');
    vera.landedMeteorThisBattle = true;
    killFighter(state, vera);
    reviveFighter(state, vera);
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(scored(state, vera.playerId, 'liora3')).toBe(false);
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
    const matt = findFighter(state, 'Eric');
    const kit = findFighter(state, 'Kit');
    // Equal 4-point totals, but only Eric actually landed a Last Shot — tallied in
    // state.lastShotCounts (off battle.finishedBy), not by scanning scoreLog for eric2/liora2.
    state.scoreLog.push({ playerId: matt.playerId, conditionId: 'eric1', points: 1, atSlot: 10, bossId: 'Ragorath' });
    state.scoreLog.push({ playerId: matt.playerId, conditionId: 'eric2', points: 3, atSlot: 10, bossId: 'Ragorath' });
    state.lastShotCounts[matt.playerId] = 1;
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
