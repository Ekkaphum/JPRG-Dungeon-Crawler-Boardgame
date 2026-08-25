import { describe, it, expect } from 'vitest';
import { prepareBattle, applyBossMove, createRNG, dealDamageToFighterFromBoss } from '@engine/index';
import { AILMENTS, type AilmentId } from '@content/ailments';
import { BOSSES } from '@content/bosses';
import { fixedDraftState } from './testUtils';

// Written off the back of the first v0.4.0 balance run, which turned up two things worth pinning
// down so they cannot regress or drift silently.

function v040State() {
  const state = fixedDraftState();
  state.ruleset = 'v0.4';
  prepareBattle(state);
  return state;
}

describe('ailments only exist in the v0.4 ruleset', () => {
  it('the stable ruleset applies nothing, so its measured balance is unaffected', () => {
    const state = fixedDraftState(); // defaults to v0.3
    prepareBattle(state);
    applyBossMove(state, 'B', createRNG(1)); // Ground Stomp — inflicts daze under v0.4
    for (const f of state.battle!.fighters) expect(f.ailments).toHaveLength(0);
  });

  it('the same move under v0.4 does apply its ailment', () => {
    const state = v040State();
    applyBossMove(state, 'B', createRNG(1));
    expect(state.battle!.fighters.some((f) => f.ailments.some((a) => a.id === 'daze'))).toBe(true);
  });
});

describe('every ailment a boss can inflict is one a party can answer', () => {
  // The first v0.4.0 sim measured doom firing 2,221 times in 5,000 games — a 41% kill rate on a
  // status whose own rules text promises it can be cleansed. It could not: `cleanseAilments` existed
  // but had no caller anywhere in the game, so doom was a delayed execution with no counterplay for
  // any drafted character. This asserts the *design* invariant rather than the number, so the same
  // hole cannot reopen by adding a new boss ailment without an answer to it.
  const inflictable: AilmentId[] = [];
  for (const boss of Object.values(BOSSES)) {
    for (const move of boss.moves) if (move.inflicts) inflictable.push(move.inflicts);
  }

  it('lethal ailments are never left without an answer', () => {
    for (const id of new Set(inflictable)) {
      const def = AILMENTS[id];
      // A "kills you outright when the timer runs out" ailment is only fair if something can remove
      // it. Everything else merely costs HP or tempo and can be played through.
      if (id === 'doom') {
        expect(
          def.cleansable,
          'doom must be answerable — otherwise it is an unavoidable execution, not a status',
        ).toBe(true);
      }
    }
  });

  it('poison ticks on the boss clock and bleed on the victim clock — mirrored, not duplicated', () => {
    const state = v040State();
    const f = state.battle!.fighters[0];
    const before = f.hp;
    dealDamageToFighterFromBoss(state, f, 1);
    expect(f.hp).toBeLessThan(before);
  });
});
