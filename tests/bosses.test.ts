import { describe, it, expect } from 'vitest';
import { createRNG, prepareBattle, resolveBossPending, declareBossAction, applyDamageToBoss, declareSkill, pickExtreme, pickExtremeN, pushScore } from '@engine/index';
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

  // v0.3.11: the tax scales instead of being a flat +2 above ⏱5. At the old threshold it reached
  // only 2 of the roster's 16 skills (7.8% of declares measured) because the v0.3.3 skill rebuild
  // made almost everything faster — his signature mechanic had quietly stopped mattering.
  it('adds +2 slots to a player skill with base ⏱ >= 6', () => {
    const state = somnivarState();
    const liora = findFighter(state, 'Liora');
    const marker = state.battle!.marker;
    liora.mana = 0;
    declareSkill(state, liora, { kind: 'DECLARE_ACTION', skillId: 'Meteor', manaSpent: 0 }, createRNG(1));
    expect(liora.pending!.landedAtSlot).toBe(marker - (7 + 2));
  });

  it('adds +1 slot to a player skill with base ⏱ 4-5', () => {
    const state = somnivarState();
    const eric = findFighter(state, 'Eric');
    const marker = state.battle!.marker;
    declareSkill(state, eric, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' }, createRNG(1));
    expect(eric.pending!.landedAtSlot).toBe(marker - (4 + 1));
  });

  it('does not tax skills with base ⏱ < 4', () => {
    const state = somnivarState();
    const liora = findFighter(state, 'Liora');
    const marker = state.battle!.marker;
    declareSkill(state, liora, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 0 }, createRNG(1));
    expect(liora.pending!.landedAtSlot).toBe(marker - 3);
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

describe('immediate boss moves (v0.3.11)', () => {
  /** Forces the boss's d6 so a specific move is the one declared. */
  const fixedDie = (n: number) => ({ ...createRNG(1), int: () => n } as ReturnType<typeof createRNG>);

  it("Aurelius's Golden Throne resolves at declare and leaves nothing pending to read", () => {
    const state = fixedDraftState();
    state.bossIndex = 2;
    prepareBattle(state);
    const battle = state.battle!;
    const armorBefore = battle.armor;
    battle.bossHp = battle.bossHpMax - 20;
    const hpBefore = battle.bossHp;

    declareBossAction(state, fixedDie(4)); // 4-5 = Golden Throne

    // Applied immediately: armour up, self-heal done, and no bossPending left behind — there is
    // nothing for a player to Guard against, Trap, or otherwise respond to.
    expect(battle.armor).toBe(armorBefore + 1);
    expect(battle.bossHp).toBe(hpBefore + 8);
    expect(battle.bossPending).toBeNull();
    expect(battle.log.some((e) => e.t === 'BOSS_MOVE' && e.moveKey === 'B')).toBe(true);
  });

  it('the pawn still walks the immediate move\'s full ⏱, exactly like a delayed one', () => {
    const state = fixedDraftState();
    state.bossIndex = 2;
    prepareBattle(state);
    const battle = state.battle!;
    const marker = battle.marker;
    declareBossAction(state, fixedDie(4)); // Golden Throne, ⏱4
    expect(battle.bossSlot).toBe(marker - 4);
  });

  it('a delayed move is untouched — it still waits for its landing slot', () => {
    const state = fixedDraftState();
    state.bossIndex = 2;
    prepareBattle(state);
    const battle = state.battle!;
    const hpBefore = battle.fighters.map((f) => f.hp);
    declareBossAction(state, fixedDie(1)); // 1-3 = Procession, delayed
    expect(battle.bossPending?.moveKey).toBe('A');
    expect(battle.fighters.map((f) => f.hp)).toEqual(hpBefore); // nothing has landed yet
  });
});

describe("Aurelius's Procession pierces Blessing (v0.3.11)", () => {
  it('ignores the party damage reduction that would otherwise blunt it', () => {
    const state = fixedDraftState();
    state.bossIndex = 2;
    prepareBattle(state);
    const battle = state.battle!;
    const luna = findFighter(state, 'Luna');
    const target = findFighter(state, 'Kit');
    // Put a Blessing up and make Kit the score leader so Procession picks him.
    battle.partyBuff = { atk: 3, dmgReduction: 2, ownerId: luna.playerId, expiresAtSlot: 0 };
    pushScore(state, { playerId: target.playerId, conditionId: 'kit1', points: 5 });
    const hpBefore = target.hp;

    battle.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: battle.marker + 5, landedAtSlot: battle.marker };
    resolveBossPending(state, createRNG(1));

    // Full 12, not 12 - 2: the blessing does not reduce it. Guard and personal shields still would.
    expect(target.hp).toBe(hpBefore - 12);
  });

  it('every other Aurelius move still respects the party damage reduction', () => {
    const state = fixedDraftState();
    state.bossIndex = 2;
    prepareBattle(state);
    const battle = state.battle!;
    const luna = findFighter(state, 'Luna');
    battle.partyBuff = { atk: 3, dmgReduction: 2, ownerId: luna.playerId, expiresAtSlot: 0 };
    const before = battle.fighters.map((f) => f.hp);

    battle.bossPending = { moveKey: 'C', die: 6, declaredAtSlot: battle.marker + 7, landedAtSlot: battle.marker };
    resolveBossPending(state, createRNG(1)); // Judgment: 7 to anyone above half HP

    for (const [i, f] of battle.fighters.entries()) expect(f.hp).toBe(before[i] - (7 - 2));
  });
});
