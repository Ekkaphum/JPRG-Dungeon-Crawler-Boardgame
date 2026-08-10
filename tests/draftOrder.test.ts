import { describe, it, expect } from 'vitest';
import { createRNG, newGame, runDraft, type Choice, type PendingDecision } from '@engine/index';

function setup(draftOrder: number[] | null) {
  return {
    players: [
      { name: 'A', kind: 'bot' as const },
      { name: 'B', kind: 'bot' as const },
      { name: 'C', kind: 'bot' as const },
      { name: 'D', kind: 'bot' as const },
    ],
    difficulty: 'standard' as const,
    draftOrder,
  };
}

/** Runs the draft, always taking the first still-available character, and reports who picked when. */
function runAndRecordOrder(draftOrder: number[] | null, seed: number) {
  const state = newGame(setup(draftOrder), seed);
  const rng = createRNG(seed);
  const gen = runDraft(state, rng);
  const picked: number[] = [];
  let res = gen.next();
  while (!res.done) {
    const d: PendingDecision = res.value;
    if (d.kind !== 'CHOOSE_CHARACTER') throw new Error('unexpected decision');
    picked.push(d.playerId);
    const choice: Choice = { kind: 'CHOOSE_CHARACTER', charId: d.available[0] };
    res = gen.next(choice);
  }
  return { picked, state };
}

describe('draft order', () => {
  it('follows a chosen order exactly', () => {
    const { picked, state } = runAndRecordOrder([2, 0, 3, 1], 42);
    // The last picker takes whatever is left, so only the first three are asked.
    expect(picked).toEqual([2, 0, 3]);
    // Everyone still ends up with a distinct character.
    expect(new Set(state.players.map((p) => p.charId)).size).toBe(4);
  });

  it('honours the chosen order regardless of seed', () => {
    for (const seed of [1, 7, 999]) {
      expect(runAndRecordOrder([3, 1, 0, 2], seed).picked).toEqual([3, 1, 0]);
    }
  });

  it('falls back to a seeded random order when none is given', () => {
    const a = runAndRecordOrder(null, 12345).picked;
    const b = runAndRecordOrder(null, 12345).picked;
    expect(a).toEqual(b); // deterministic for a given seed
    expect(new Set(a).size).toBe(3); // three distinct askers, fourth is implied
  });
});
