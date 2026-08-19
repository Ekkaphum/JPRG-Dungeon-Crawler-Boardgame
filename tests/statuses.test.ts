import { describe, it, expect } from 'vitest';
import { prepareBattle } from '@engine/index';
import { bossStatuses, heroStatuses, STATUS_DEF, type StatusId } from '@content/statuses';
import { fixedDraftState } from './testUtils';

function battleFor(bossId: 'Ragorath' | 'Somnivar' | 'Aurelius') {
  const state = fixedDraftState();
  state.bossIndex = state.bossQueue.indexOf(bossId);
  prepareBattle(state);
  return state;
}

const ids = (list: { id: StatusId }[]) => list.map((s) => s.id);

describe('boss status badges', () => {
  it('Ragorath always shows its Rage stack, including at 0', () => {
    const state = battleFor('Ragorath');
    expect(ids(bossStatuses(state.battle!))).toContain('rage');
    expect(bossStatuses(state.battle!).find((s) => s.id === 'rage')?.value).toBe('0');
    state.battle!.rage = 3;
    expect(bossStatuses(state.battle!).find((s) => s.id === 'rage')?.value).toBe('3');
  });

  it('Somnivar advertises its passive drowsy aura', () => {
    const state = battleFor('Somnivar');
    expect(ids(bossStatuses(state.battle!))).toContain('sleepAura');
    expect(ids(bossStatuses(state.battle!))).not.toContain('rage');
  });

  it('Aurelius shows armor while it has any, and drops the badge once broken to 0', () => {
    const state = battleFor('Aurelius');
    expect(bossStatuses(state.battle!).find((s) => s.id === 'armor')?.value).toBe('2');
    state.battle!.armor = 0;
    expect(ids(bossStatuses(state.battle!))).not.toContain('armor');
  });

  it('weak point shows on whichever boss is up', () => {
    const state = battleFor('Ragorath');
    expect(ids(bossStatuses(state.battle!))).not.toContain('weakPoint');
    state.battle!.weakPoint = { ownerId: 1, expiresAtSlot: 0, hitsPaid: 0 };
    expect(ids(bossStatuses(state.battle!))).toContain('weakPoint');
  });
});

describe('hero status badges', () => {
  it('shows each shield kind with its reduction', () => {
    const state = battleFor('Ragorath');
    const f = state.battle!.fighters[0];
    f.shield = { kind: 'counter', reduction: 50, counterDmg: 12 };
    expect(heroStatuses(state.battle!, f).find((s) => s.id === 'counter')?.value).toBe('-50%');
    f.shield = { kind: 'mana', reduction: 3 };
    expect(heroStatuses(state.battle!, f).find((s) => s.id === 'manaShield')?.value).toBe('-3');
  });

  it('Blessing shows on every hero, not just the caster', () => {
    const state = battleFor('Ragorath');
    state.battle!.partyBuff = { atk: 3, dmgReduction: 2, ownerId: 3, expiresAtSlot: 10 };
    for (const f of state.battle!.fighters) {
      expect(heroStatuses(state.battle!, f).find((s) => s.id === 'blessing')?.value).toBe('+3/-2');
    }
  });

  it('a downed hero reports only its revive slot, hiding stale buffs', () => {
    const state = battleFor('Ragorath');
    state.battle!.partyBuff = { atk: 3, dmgReduction: 2, ownerId: 0, expiresAtSlot: 10 };
    const f = state.battle!.fighters[0];
    f.alive = false;
    f.reviveAtSlot = 13;
    expect(ids(heroStatuses(state.battle!, f))).toEqual(['down']);
    expect(heroStatuses(state.battle!, f)[0].value).toBe('→13');

    f.reviveAtSlot = null;
    expect(heroStatuses(state.battle!, f)[0].value).toBe('✕');
  });
});

describe('status catalog', () => {
  it('every status has both a label and an explanation in both languages', () => {
    for (const [id, def] of Object.entries(STATUS_DEF)) {
      expect(def.label.th, `${id} th label`).toBeTruthy();
      expect(def.label.en, `${id} en label`).toBeTruthy();
      expect(def.desc.th, `${id} th desc`).toBeTruthy();
      expect(def.desc.en, `${id} en desc`).toBeTruthy();
    }
  });
});
