import { describe, it, expect } from 'vitest';
import { prepareBattle, declareSkill, legalTrapSlots, runClockBattle, createRNG } from '@engine/index';
import { fixedDraftState } from './testUtils';

// Set Trap was redesigned in v0.3.0.2 so it can only be armed *inside the skill's own ⏱ window* —
// a read of where the boss stops next rather than a snipe anywhere on the clock. The window was
// computed in two places, and the human UI used the wrong list (every empty slot below the marker),
// so players could arm traps anywhere while bots played by the rules. These tests pin the rule to
// one shared function and prove the engine now rejects out-of-window slots outright.

function kitFighter(state: ReturnType<typeof fixedDraftState>) {
  const player = state.players.find((p) => p.charId === 'Kit')!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

describe('Set Trap legal slots (§v0.3.0.2)', () => {
  it('offers only slots inside the skill\'s own ⏱ window', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    state.battle!.marker = 20;
    const kit = kitFighter(state);

    // Set Trap is ⏱4 at Lv1 → the window is the 3 slots strictly between the marker and where
    // Kit's pawn lands (20 → 16), i.e. 19, 18, 17.
    expect(legalTrapSlots(state, kit)).toEqual([19, 18, 17]);
  });

  it('excludes slots already holding another trap', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    state.battle!.marker = 20;
    const kit = kitFighter(state);
    state.battle!.traps.push({ slot: 18, dmg: 4, ownerId: kit.playerId });

    expect(legalTrapSlots(state, kit)).toEqual([19, 17]);
  });

  it('never returns slot 0 or below — slot 0 is dead ground, nothing can trigger there', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    state.battle!.marker = 2;
    const kit = kitFighter(state);

    expect(legalTrapSlots(state, kit)).toEqual([1]);
  });

  it('arms the trap when the slot is inside the window', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    state.battle!.marker = 20;
    const kit = kitFighter(state);

    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SetTrap', trapSlot: 18 });
    expect(state.battle!.traps).toHaveLength(1);
    expect(state.battle!.traps[0]).toMatchObject({ slot: 18, ownerId: kit.playerId });
  });

  it('rejects a slot outside the window instead of silently arming it', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    state.battle!.marker = 20;
    const kit = kitFighter(state);

    // Slot 3 is empty and below the marker — exactly what the old UI would have offered — but it
    // is far outside Set Trap's ⏱4 window, so it must not be accepted.
    expect(() => declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SetTrap', trapSlot: 3 })).toThrow(/illegal Set Trap slot/);
    expect(state.battle!.traps).toHaveLength(0);
  });

  it('rejects a declare with no slot at all', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    state.battle!.marker = 20;
    const kit = kitFighter(state);

    expect(() => declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SetTrap' })).toThrow(/illegal Set Trap slot/);
    expect(state.battle!.traps).toHaveLength(0);
  });

  it('hands the walk loop the same list the engine will accept', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const gen = runClockBattle(state, createRNG(7));

    // Walk forward to the first time Kit is asked to declare, then check the options the engine
    // offered match legalTrapSlots exactly — this is the drift the bug came from.
    let res = gen.next();
    const kitId = state.players.find((p) => p.charId === 'Kit')!.id;
    while (!res.done && res.value.playerId !== kitId) {
      res = gen.next({ kind: 'DECLARE_ACTION', skillId: 'Slash' });
    }

    expect(res.done).toBe(false);
    const decision = res.value as Extract<typeof res.value, { kind: 'DECLARE_ACTION' }>;
    expect(decision.options.trapSlots).toEqual(legalTrapSlots(state, kitFighter(state)));
  });
});
