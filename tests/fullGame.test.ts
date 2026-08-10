import { describe, it, expect } from 'vitest';
import { playFullGame } from './testUtils';

describe('full game smoke test (easy bots, many seeds)', () => {
  for (const seed of [1, 2, 3, 42, 1337, 99999]) {
    it(`terminates cleanly for seed ${seed}`, async () => {
      const state = await playFullGame(seed);
      expect(state.gameOver).not.toBeNull();
      expect(['win', 'allLose']).toContain(state.gameOver!.outcome);

      // Every player got a distinct character from the draft.
      const charIds = state.players.map((p) => p.charId);
      expect(new Set(charIds).size).toBe(4);

      if (state.gameOver!.outcome === 'win') {
        expect(state.bossIndex).toBe(3);
        const totals = state.gameOver!.totals;
        for (const p of state.players) expect(totals[p.id]).toBeGreaterThanOrEqual(0);
      } else {
        expect(state.bossIndex).toBeLessThan(3);
      }

      // The clock never ran below its floor.
      expect(state.battle!.marker).toBeGreaterThanOrEqual(-1);
    });
  }
});
