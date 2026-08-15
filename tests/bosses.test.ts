import { describe, it, expect } from 'vitest';
import { createRNG, prepareBattle, resolveBossPending, applyDamageToBoss, declareSkill, pickExtreme, pickExtremeN, pushScore } from '@engine/index';
import { fixedDraftState } from './testUtils';

function findFighter(state: ReturnType<typeof fixedDraftState>, charId: string) {
  const player = state.players.find((p) => p.charId === charId)!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

describe('rank.pickExtreme tie-break (docs/10-v0.3.0-rulings.md §3)', () => {
  it('higher slot wins; stacked ties go to whoever was placed first', () => {
    const items = [
      { slot: 10, stackSeq: 2, id: 'a' },
      { slot: 10, stackSeq: 0, id: 'b' },
      { slot: 8, stackSeq: 1, id: 'c' },
    ];
    expect(pickExtreme(items, (i) => 0, 'max').id).toBe('b'); // same "stat", slot 10 beats 8, then lower stackSeq wins
  });

  it('pickExtremeN returns the N lowest, respecting the same tie order', () => {
    const items = [
      { slot: 5, stackSeq: 0, hp: 3 },
      { slot: 7, stackSeq: 1, hp: 3 },
      { slot: 2, stackSeq: 2, hp: 9 },
    ];
    const two = pickExtremeN(items, (i) => i.hp, 'min', 2);
    expect(two.map((i) => i.slot)).toEqual([7, 5]); // both hp=3, higher slot ranks first
  });
});

describe('Ragorath — Rage (§9①)', () => {
  it('adds current Rage to the hit, then resets to 0', () => {
    const state = fixedDraftState();
    prepareBattle(state); // bossIndex 0 = Ragorath by default
    const battle = state.battle!;
    expect(battle.bossId).toBe('Ragorath');
    battle.rage = 3;
    battle.bossPending = { moveKey: 'B', die: 4, declaredAtSlot: 20, landedAtSlot: 15 };
    const matt = findFighter(state, 'Eric');
    const hpBefore = matt.hp;
    resolveBossPending(state, createRNG(1));
    expect(matt.hp).toBe(hpBefore - 7); // base 4 + rage 3
    expect(battle.rage).toBe(0);
  });

  it('rage increments every time the boss takes damage, including 0-damage hits', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const battle = state.battle!;
    applyDamageToBoss(state, 0, 5, { ignoresArmor: false, skillId: 'Slash' });
    expect(battle.rage).toBe(1);
    applyDamageToBoss(state, 0, 5, { ignoresArmor: false, skillId: 'Slash' });
    expect(battle.rage).toBe(2);
  });
});

describe('Somnivar — sleep tax + push moves (§9②)', () => {
  function somnivarState() {
    const state = fixedDraftState();
    state.bossIndex = 1;
    prepareBattle(state);
    return state;
  }

  it('adds +2 slots to any player skill with base ⏱ >= 5', () => {
    const state = somnivarState();
    const vera = findFighter(state, 'Liora');
    const marker = state.battle!.marker;
    vera.mana = 0;
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Meteor', manaSpent: 0 }, createRNG(1));
    expect(vera.pending!.landedAtSlot).toBe(marker - (7 + 2));
  });

  it('does not tax skills with base ⏱ < 5', () => {
    const state = somnivarState();
    const vera = findFighter(state, 'Liora');
    const marker = state.battle!.marker;
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 0 }, createRNG(1));
    expect(vera.pending!.landedAtSlot).toBe(marker - 3);
  });

  it('move A (drowsy breath) hits everyone and pushes every player pawn down 1', () => {
    const state = somnivarState();
    const battle = state.battle!;
    const matt = findFighter(state, 'Eric');
    const slotBefore = matt.slot;
    const hpBefore = matt.hp;
    battle.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: 22, landedAtSlot: 18 };
    resolveBossPending(state, createRNG(1));
    expect(matt.hp).toBe(hpBefore - 4);
    expect(matt.slot).toBe(slotBefore - 1);
  });

  it('move C (eternal slumber) deals no damage and pushes everyone down 4', () => {
    const state = somnivarState();
    const battle = state.battle!;
    const matt = findFighter(state, 'Eric');
    const slotBefore = matt.slot;
    const hpBefore = matt.hp;
    battle.bossPending = { moveKey: 'C', die: 6, declaredAtSlot: 22, landedAtSlot: 14 };
    resolveBossPending(state, createRNG(1));
    expect(matt.hp).toBe(hpBefore);
    expect(matt.slot).toBe(slotBefore - 4);
  });
});

describe('Aurelius — armor break + Golden Throne heal (§9③)', () => {
  function aureliusState() {
    const state = fixedDraftState();
    state.bossIndex = 2;
    prepareBattle(state);
    return state;
  }

  it('breaks armor by 1 only when post-armor damage exceeds 12', () => {
    const state = aureliusState();
    expect(state.battle!.armor).toBe(2);
    applyDamageToBoss(state, 0, 20, { ignoresArmor: false, skillId: 'Meteor' }); // 20-2=18 > 12
    expect(state.battle!.armor).toBe(1);
    applyDamageToBoss(state, 0, 10, { ignoresArmor: false, skillId: 'Slash' }); // 10-1=9, not > 12
    expect(state.battle!.armor).toBe(1);
  });

  it('Golden Throne (move B) adds armor and heals, capped at max HP', () => {
    const state = aureliusState();
    const battle = state.battle!;
    battle.bossHp = battle.bossHpMax - 3;
    battle.bossPending = { moveKey: 'B', die: 4, declaredAtSlot: 20, landedAtSlot: 16 };
    resolveBossPending(state, createRNG(1));
    expect(battle.armor).toBe(3);
    expect(battle.bossHp).toBe(battle.bossHpMax);
  });

  it('Judgment (move C) doubles damage against anyone below half HP', () => {
    const state = aureliusState();
    const battle = state.battle!;
    const matt = findFighter(state, 'Eric');
    const kit = findFighter(state, 'Kit');
    // Inflate maxHp so the 14-damage hit doesn't clamp at 0 and mask the pre-clamp value.
    matt.maxHp = 100;
    matt.hp = 40; // below half of 100
    kit.hp = kit.maxHp; // full — not below half
    battle.bossPending = { moveKey: 'C', die: 6, declaredAtSlot: 20, landedAtSlot: 13 };
    const mattHpBefore = matt.hp;
    const kitHpBefore = kit.hp;
    resolveBossPending(state, createRNG(1));
    expect(mattHpBefore - matt.hp).toBe(14);
    expect(kitHpBefore - kit.hp).toBe(7);
  });

  it('move A targets whoever currently has the highest claimed score', () => {
    const state = aureliusState();
    const battle = state.battle!;
    const kit = findFighter(state, 'Kit');
    pushScore(state, { playerId: kit.playerId, conditionId: 'kit1', points: 10 });
    battle.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: 20, landedAtSlot: 15 };
    const hpBefore = kit.hp;
    resolveBossPending(state, createRNG(1));
    expect(kit.hp).toBe(hpBefore - 12);
  });
});
