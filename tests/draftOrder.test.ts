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
    // 6 characters for 4 players (2026-08-11) means nobody's pick is ever forced anymore — even
    // the last player in the order is asked, choosing among whatever 3 are still left. Before this
    // change, with exactly 4 characters, the 4th player would have been auto-assigned and never
    // appear here.
    expect(picked).toEqual([2, 0, 3, 1]);
    // Everyone still ends up with a distinct character.
    expect(new Set(state.players.map((p) => p.charId)).size).toBe(4);
  });

  it('honours the chosen order regardless of seed', () => {
    for (const seed of [1, 7, 999]) {
      expect(runAndRecordOrder([3, 1, 0, 2], seed).picked).toEqual([3, 1, 0, 2]);
    }
  });

  it('falls back to a seeded random order when none is given', () => {
    const a = runAndRecordOrder(null, 12345).picked;
    const b = runAndRecordOrder(null, 12345).picked;
    expect(a).toEqual(b); // deterministic for a given seed
    expect(new Set(a).size).toBe(4); // all four players are actually asked
  });

  it('leaves the 2 undrafted characters out of the game entirely', () => {
    const { state } = runAndRecordOrder([0, 1, 2, 3], 7);
    expect(new Set(state.players.map((p) => p.charId)).size).toBe(4);
  });

  it('gives the last player in the order a real choice, not a forced pick', () => {
    // Regression guard for the whole point of the 6-character roster: with only 4 characters, the
    // last picker's CHOOSE_CHARACTER decision never got yielded at all (runDraft's
    // `available.length === 1` fast path auto-assigned it). Assert the decision the last player
    // actually saw offered more than one option.
    const state = newGame(setup([2, 0, 3, 1]), 42);
    const rng = createRNG(42);
    const gen = runDraft(state, rng);
    let res = gen.next();
    let lastDecisionOptions: number | null = null;
    while (!res.done) {
      const d: PendingDecision = res.value;
      if (d.kind !== 'CHOOSE_CHARACTER') throw new Error('unexpected decision');
      lastDecisionOptions = d.available.length;
      res = gen.next({ kind: 'CHOOSE_CHARACTER', charId: d.available[0] });
    }
    expect(lastDecisionOptions).toBeGreaterThan(1);
  });
});
