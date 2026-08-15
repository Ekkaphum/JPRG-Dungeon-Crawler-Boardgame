import type { BossId, GameState, PlayerId } from '@engine/index';

export interface ScoreConditionBreakdown {
  conditionId: string;
  count: number;
  points: number;
}

export interface BossScoreBreakdown {
  bossId: BossId;
  total: number;
  conditions: ScoreConditionBreakdown[];
}

export interface PlayerScoreBreakdown {
  playerId: PlayerId;
  total: number;
  bosses: BossScoreBreakdown[];
}

/** Groups the authoritative score log into the shape shown on the final result screen. Repeated
 *  per-hit/per-heal conditions are collapsed to one row with a count, while points retain the
 *  exact values actually awarded at the time rather than being recomputed from current content. */
export function buildScoreBreakdown(state: GameState): PlayerScoreBreakdown[] {
  return state.players.map((player) => {
    const entries = state.scoreLog.filter((entry) => entry.playerId === player.id);
    const bosses: BossScoreBreakdown[] = [];

    for (const bossId of state.bossQueue) {
      const bossEntries = entries.filter((entry) => entry.bossId === bossId);
      if (bossEntries.length === 0) continue;

      const conditions: ScoreConditionBreakdown[] = [];
      for (const entry of bossEntries) {
        let condition = conditions.find((row) => row.conditionId === entry.conditionId);
        if (!condition) {
          condition = { conditionId: entry.conditionId, count: 0, points: 0 };
          conditions.push(condition);
        }
        condition.count += 1;
        condition.points += entry.points;
      }

      bosses.push({
        bossId,
        total: conditions.reduce((sum, row) => sum + row.points, 0),
        conditions,
      });
    }

    return {
      playerId: player.id,
      total: bosses.reduce((sum, boss) => sum + boss.total, 0),
      bosses,
    };
  });
}
