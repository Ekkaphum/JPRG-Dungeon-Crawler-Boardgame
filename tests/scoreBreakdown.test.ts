import { describe, expect, it } from 'vitest';
import { buildScoreBreakdown } from '@session/scoreBreakdown';
import { fixedDraftState } from './testUtils';

describe('buildScoreBreakdown', () => {
  it('groups repeated conditions by player and boss while preserving awarded points', () => {
    const state = fixedDraftState();
    state.scoreLog.push(
      { playerId: 0, conditionId: 'eric1', points: 1, atSlot: 18, bossId: 'Ragorath' },
      { playerId: 0, conditionId: 'eric1', points: 1, atSlot: 12, bossId: 'Ragorath' },
      { playerId: 0, conditionId: 'timeBonus', points: 3, atSlot: 6, bossId: 'Ragorath' },
      { playerId: 0, conditionId: 'eric2', points: 3, atSlot: 8, bossId: 'Somnivar' },
      { playerId: 1, conditionId: 'kit1', points: 1, atSlot: 10, bossId: 'Ragorath' }
    );

    const result = buildScoreBreakdown(state);
    const matt = result.find((player) => player.playerId === 0)!;
    const ragorath = matt.bosses.find((boss) => boss.bossId === 'Ragorath')!;

    expect(matt.total).toBe(8);
    expect(ragorath.total).toBe(5);
    expect(ragorath.conditions).toEqual([
      { conditionId: 'eric1', count: 2, points: 2 },
      { conditionId: 'timeBonus', count: 1, points: 3 },
    ]);
    expect(matt.bosses.find((boss) => boss.bossId === 'Somnivar')?.total).toBe(3);
    expect(result.find((player) => player.playerId === 1)?.total).toBe(1);
  });

  it('keeps players with no score so the final screen still lists the full party', () => {
    const state = fixedDraftState();
    const result = buildScoreBreakdown(state);
    expect(result).toHaveLength(4);
    expect(result.every((player) => player.total === 0 && player.bosses.length === 0)).toBe(true);
  });
});
