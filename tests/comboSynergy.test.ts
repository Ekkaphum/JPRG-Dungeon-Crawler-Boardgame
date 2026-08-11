import { describe, it, expect } from 'vitest';
import { prepareBattle } from '@engine/index';
import { comboSynergyBonus } from '@bots/heuristics';
import { fixedDraftState } from './testUtils';

// Aurelius's armor only breaks above a >12 post-armor hit, and Kit/Luna can't reach that alone
// (GAME_DESIGN_v0_3_0.md §9) — the only path is timing weak point + Blessing to land under a
// teammate's big attackMana hit. The pre-fix bots never looked at what a teammate had already
// declared, so the combo essentially never happened (0 of 1500 sim games ever landed a >=25 dmg
// hit). These tests pin the specific timing conditions comboSynergyBonus checks.

function ids(state: ReturnType<typeof fixedDraftState>) {
  const byChar = (c: string) => state.players.find((p) => p.charId === c)!.id;
  return { matt: byChar('Matt'), kit: byChar('Kit'), vera: byChar('Vera'), luna: byChar('Luna') };
}

function fighterOf(state: ReturnType<typeof fixedDraftState>, playerId: number) {
  return state.battle!.fighters.find((f) => f.playerId === playerId)!;
}

describe('comboSynergyBonus — Kit opening weak point for Vera', () => {
  it('rewards QuickShot when it opens in time for a pending Fireball/Meteor', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { kit, vera } = ids(state);
    state.battle!.marker = 20;
    // Vera declared Meteor (⏱7) at marker 20 → resolves at slot 13.
    fighterOf(state, vera).pending = { skillId: 'Meteor', declaredAtSlot: 20, landedAtSlot: 13, manaSpent: 3 };

    // Kit's QuickShot (⏱3) from marker 20 lands at 17 — well before Vera's 13, so it's open in time.
    const bonus = comboSynergyBonus(state, kit, { kind: 'DECLARE_ACTION', skillId: 'QuickShot' });
    expect(bonus).toBeGreaterThan(0);
  });

  it('does not reward it if the weak point would open too late to still be up at Vera\'s resolve', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { kit, vera } = ids(state);
    state.battle!.marker = 8;
    // Vera's Meteor already resolves at 13 (declared earlier, marker has since moved to 8) —
    // wait: to keep this realistic, declare Vera's pending to resolve *before* Kit even could.
    fighterOf(state, vera).pending = { skillId: 'Meteor', declaredAtSlot: 20, landedAtSlot: 13, manaSpent: 3 };
    // Kit declaring now (marker 8) would land at 5 — after Vera already resolved at 13.
    const bonus = comboSynergyBonus(state, kit, { kind: 'DECLARE_ACTION', skillId: 'QuickShot' });
    expect(bonus).toBe(0);
  });

  it('does not reward it when the weak point is already active', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { kit, vera } = ids(state);
    state.battle!.marker = 20;
    state.battle!.weakPointActive = true;
    fighterOf(state, vera).pending = { skillId: 'Meteor', declaredAtSlot: 20, landedAtSlot: 13, manaSpent: 3 };

    const bonus = comboSynergyBonus(state, kit, { kind: 'DECLARE_ACTION', skillId: 'QuickShot' });
    expect(bonus).toBe(0);
  });

  it('does not reward it when the boss\'s already-declared move would clear it first', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { kit, vera } = ids(state);
    state.battle!.marker = 20;
    fighterOf(state, vera).pending = { skillId: 'Meteor', declaredAtSlot: 20, landedAtSlot: 13, manaSpent: 3 };
    // Boss resolves at 15 — after Kit opens (17) but before Vera's Meteor (13) — clears the window.
    state.battle!.bossPending = { moveKey: 'A', die: 2, declaredAtSlot: 20, landedAtSlot: 15 };

    const bonus = comboSynergyBonus(state, kit, { kind: 'DECLARE_ACTION', skillId: 'QuickShot' });
    expect(bonus).toBe(0);
  });

  it('is unaffected by teammates declaring a small attack instead of a big one', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { kit, matt } = ids(state);
    state.battle!.marker = 20;
    fighterOf(state, matt).pending = { skillId: 'Slash', declaredAtSlot: 20, landedAtSlot: 16 };

    const bonus = comboSynergyBonus(state, kit, { kind: 'DECLARE_ACTION', skillId: 'QuickShot' });
    expect(bonus).toBe(0);
  });

  it('only applies to Kit declaring QuickShot, not other characters or skills', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { kit, vera } = ids(state);
    state.battle!.marker = 20;
    fighterOf(state, vera).pending = { skillId: 'Meteor', declaredAtSlot: 20, landedAtSlot: 13, manaSpent: 3 };

    expect(comboSynergyBonus(state, kit, { kind: 'DECLARE_ACTION', skillId: 'TwinShot' })).toBe(0);
    expect(comboSynergyBonus(state, ids(state).matt, { kind: 'DECLARE_ACTION', skillId: 'Slash' })).toBe(0);
  });
});

describe('comboSynergyBonus — Luna timing Blessing under an incoming big hit', () => {
  it('rewards Blessing when Kit already has a pending QuickShot', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { luna, kit } = ids(state);
    state.battle!.marker = 20;
    fighterOf(state, kit).pending = { skillId: 'QuickShot', declaredAtSlot: 20, landedAtSlot: 17 };

    const bonus = comboSynergyBonus(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Blessing' });
    expect(bonus).toBeGreaterThan(0);
  });

  it('rewards Blessing when the weak point is already active', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { luna } = ids(state);
    state.battle!.marker = 20;
    state.battle!.weakPointActive = true;

    const bonus = comboSynergyBonus(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Blessing' });
    expect(bonus).toBeGreaterThan(0);
  });

  it('rewards Blessing when a teammate has a pending big hit landing in time', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { luna, vera } = ids(state);
    state.battle!.marker = 20;
    fighterOf(state, vera).pending = { skillId: 'Fireball', declaredAtSlot: 20, landedAtSlot: 17, manaSpent: 2 };

    const bonus = comboSynergyBonus(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Blessing' });
    expect(bonus).toBeGreaterThan(0);
  });

  it('does not reward it when Blessing is already up', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { luna, kit } = ids(state);
    state.battle!.marker = 20;
    state.battle!.partyBuff = { atk: 3, dmgReduction: 2, ownerId: luna };
    fighterOf(state, kit).pending = { skillId: 'QuickShot', declaredAtSlot: 20, landedAtSlot: 17 };

    const bonus = comboSynergyBonus(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Blessing' });
    expect(bonus).toBe(0);
  });

  it('does not reward it when nothing is set up yet', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const { luna } = ids(state);
    state.battle!.marker = 20;

    const bonus = comboSynergyBonus(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Blessing' });
    expect(bonus).toBe(0);
  });
});
