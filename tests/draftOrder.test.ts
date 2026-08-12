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

// Dax and Mira are temporarily disabled (2026-08-12, see the comment above CHAR_IDS in
// characters.ts) — CHAR_IDS is back to exactly 4 for now, so runDraft's `available.length === 1`
// fast path auto-assigns the last picker again and never yields them a CHOOSE_CHARACTER decision.
// These tests reflect that current 4-character behavior; the 6-character variants (last picker
// gets a real choice) should be restored once Dax/Mira are re-enabled.
describe('draft order', () => {
  it('follows a chosen order exactly', () => {
    const { picked, state } = runAndRecordOrder([2, 0, 3, 1], 42);
    // Only the first 3 pickers are actually asked — the 4th player is auto-assigned whatever's left.
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
    expect(new Set(a).size).toBe(3); // the 4th player is auto-assigned, never asked
  });

  it('leaves no characters undrafted — the full 4-character roster is used', () => {
    const { state } = runAndRecordOrder([0, 1, 2, 3], 7);
    expect(new Set(state.players.map((p) => p.charId)).size).toBe(4);
  });

  it('auto-assigns the last player in the order without asking (4-character roster)', () => {
    const state = newGame(setup([2, 0, 3, 1]), 42);
    const rng = createRNG(42);
    const gen = runDraft(state, rng);
    let res = gen.next();
    let decisionCount = 0;
    while (!res.done) {
      const d: PendingDecision = res.value;
      if (d.kind !== 'CHOOSE_CHARACTER') throw new Error('unexpected decision');
      decisionCount += 1;
      res = gen.next({ kind: 'CHOOSE_CHARACTER', charId: d.available[0] });
    }
    // Player 1 (last in the order) never gets asked — only 3 decisions for 4 players.
    expect(decisionCount).toBe(3);
    expect(state.players.find((p) => p.id === 1)!.charId).toBeTruthy();
  });
});
