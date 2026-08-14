import { describe, it, expect } from 'vitest';
import { createRNG, prepareBattle, runClockBattle, type Choice, type GameState, type PendingDecision } from '@engine/index';
import { fixedDraftState } from './testUtils';

const SIMPLE_SKILL: Record<string, string> = { Matt: 'Slash', Kit: 'QuickShot', Vera: 'Fireball', Luna: 'AuraSmite' };

async function driveBattle(state: GameState, seed: number, chooser: (state: GameState, decision: PendingDecision) => Choice, maxSteps = 5000) {
  const rng = createRNG(seed);
  const gen = runClockBattle(state, rng);
  let res = gen.next();
  let steps = 0;
  while (!res.done) {
    if (++steps > maxSteps) throw new Error('battle did not terminate');
    res = gen.next(chooser(state, res.value));
  }
}

function defaultChooser(state: GameState, decision: PendingDecision): Choice {
  if (decision.kind !== 'DECLARE_ACTION') throw new Error('unexpected decision kind in battle-only test');
  const player = state.players.find((p) => p.id === decision.playerId)!;
  const skillId = SIMPLE_SKILL[player.charId] as never;
  if (player.charId === 'Vera') return { kind: 'DECLARE_ACTION', skillId, manaSpent: 0 };
  return { kind: 'DECLARE_ACTION', skillId };
}

describe('clock walk — ordering and stacking (GAME_DESIGN_v0_3_0.md §4.1)', () => {
  it('player pawns act before the boss when stacked on the same slot', async () => {
    const state = fixedDraftState();
    prepareBattle(state);
    await driveBattle(state, 1, defaultChooser);

    const battle = state.battle!;
    // Every hero and the boss all start at slot 23 (2026-08-13 equal-start rebalance) — all 5
    // pawns stack there on turn 1.
    const declaresAt23 = battle.log.filter((e) => e.t === 'DECLARE' && e.slot === 23);
    expect(declaresAt23.length).toBeGreaterThanOrEqual(5);
    // §4.1: ties always resolve player-before-boss — every player declare must precede the boss's.
    const order = declaresAt23.map((e) => (e as Extract<typeof e, { t: 'DECLARE' }>).playerId);
    const bossIdx = order.indexOf('boss');
    for (const p of state.players) {
      expect(order.indexOf(p.id)).toBeLessThan(bossIdx);
    }
  });

  it('the marker only moves downward and the battle ends when it would go below 0', async () => {
    const state = fixedDraftState();
    prepareBattle(state);
    let lastMarker = 25;
    const markers: number[] = [];
    const rng = createRNG(2);
    const gen = runClockBattle(state, rng);
    let res = gen.next();
    let steps = 0;
    while (!res.done) {
      if (++steps > 5000) throw new Error('no terminate');
      markers.push(state.battle!.marker);
      res = gen.next(defaultChooser(state, res.value));
    }
    for (const m of markers) {
      expect(m).toBeLessThanOrEqual(lastMarker);
      lastMarker = m;
    }
    // Slot 0 is dead ground (§4.2 fix) — the clock stops there, it never goes negative.
    expect(state.battle!.marker).toBeGreaterThanOrEqual(0);
    expect(['boss_defeated', 'clock_ran_out', 'party_wiped']).toContain(state.battle!.outcome);
  });

  it("a pawn's first visit only declares — nothing resolves (§4.3)", async () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(3);
    const gen = runClockBattle(state, rng);
    // marker walks down to 23, where every hero stacks (equal-start, 2026-08-13) — Matt
    // (stackSeq 0, drafted first in fixedDraftState) is the first to declare.
    const first = gen.next();
    expect(first.done).toBe(false);
    const decision = first.value as Extract<PendingDecision, { kind: 'DECLARE_ACTION' }>;
    expect(decision.options.charId).toBe('Matt');
    // No RESOLVE_* events should exist yet — only the first DECLARE.
    const resolves = state.battle!.log.filter((e) => e.t.startsWith('RESOLVE_'));
    expect(resolves.length).toBe(0);
  });
});
