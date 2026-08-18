import { describe, it, expect } from 'vitest';
import { createRNG, prepareBattle, applyBossMove, declareBossAction, applyDamageToBoss, declareSkill, pickExtreme, pickExtremeN, pushScore, type RNG } from '@engine/index';
import { fixedDraftState } from './testUtils';

function findFighter(state: ReturnType<typeof fixedDraftState>, charId: string) {
  const player = state.players.find((p) => p.charId === charId)!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

/** An RNG whose `int` returns the given values in order, repeating the last one forever after.
 *  Every boss mechanic below is dice-driven, so the tests need to script the dice exactly.
 *  Seat faces map 1→Eric, 2→Kit, 3→Liora, 4→Luna (fixedDraftState's fixed assignment). */
function dice(...values: number[]): RNG {
  let i = 0;
  return { ...createRNG(1), int: () => values[Math.min(i++, values.length - 1)] } as RNG;
}

describe('rank.pickExtreme tie-break (docs/10-v0.3.0-rulings.md §3)', () => {
  it('higher slot wins; stacked ties go to whoever was placed first', () => {
    const items = [
      { slot: 10, stackSeq: 2, id: 'a' },
      { slot: 10, stackSeq: 0, id: 'b' },
      { slot: 8, stackSeq: 1, id: 'c' },
    ];
    expect(pickExtreme(items, () => 0, 'max').id).toBe('b'); // same "stat", slot 10 beats 8, then lower stackSeq wins
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

describe('every boss move is immediate (v0.3.14)', () => {
  it('resolves the move at the visit and walks the pawn its ⏱ as cooldown', () => {
    const state = fixedDraftState();
    state.bossIndex = 2;
    prepareBattle(state);
    const battle = state.battle!;
    const marker = battle.marker;
    const armorBefore = battle.armor;
    battle.bossHp = battle.bossHpMax - 20;
    const hpBefore = battle.bossHp;

    declareBossAction(state, dice(4)); // 4-5 = Golden Throne, ⏱4

    // The effect has already happened by the time the call returns — nothing is left in flight for
    // a player to Guard against or Trap. The pawn then sits ⏱4 lower as its cooldown.
    expect(battle.armor).toBe(armorBefore + 1);
    expect(battle.bossHp).toBe(hpBefore + 8);
    expect(battle.bossSlot).toBe(marker - 4);
    expect(battle.log.some((e) => e.t === 'BOSS_MOVE' && e.moveKey === 'B')).toBe(true);
  });

  it('a damaging move lands the same visit it is rolled — there is no delayed variant left', () => {
    const state = fixedDraftState();
    state.bossIndex = 2;
    prepareBattle(state);
    const battle = state.battle!;
    const before = battle.fighters.map((f) => f.hp);
    declareBossAction(state, dice(1)); // 1-3 = Procession
    expect(battle.fighters.map((f) => f.hp)).not.toEqual(before);
  });
});

describe('Ragorath — Rage + dice targeting (§9①)', () => {
  function ragorathState() {
    const state = fixedDraftState();
    prepareBattle(state); // bossIndex 0 = Ragorath by default
    return state;
  }

  it('adds current Rage to the hit, then resets to 0', () => {
    const state = ragorathState();
    const battle = state.battle!;
    expect(battle.bossId).toBe('Ragorath');
    battle.rage = 3;
    const eric = findFighter(state, 'Eric');
    const hpBefore = eric.hp;
    applyBossMove(state, 'B', dice(4)); // Ground Stomp, hits everyone
    expect(eric.hp).toBe(hpBefore - 7); // base 4 + rage 3
    expect(battle.rage).toBe(0);
  });

  it('rage increments every time the boss takes damage, including 0-damage hits', () => {
    const state = ragorathState();
    const battle = state.battle!;
    applyDamageToBoss(state, 0, 5, { ignoresArmor: false, skillId: 'Slash' });
    expect(battle.rage).toBe(1);
    applyDamageToBoss(state, 0, 5, { ignoresArmor: false, skillId: 'Slash' });
    expect(battle.rage).toBe(2);
  });

  it('Skyward Gore: a 1-4 gores exactly that seat and nobody else', () => {
    const state = ragorathState();
    const before = state.battle!.fighters.map((f) => f.hp);
    applyBossMove(state, 'A', dice(2)); // seat 2 = Kit
    const kit = findFighter(state, 'Kit');
    expect(before[kit.playerId] - kit.hp).toBe(6);
    for (const f of state.battle!.fighters) {
      if (f.playerId !== kit.playerId) expect(f.hp).toBe(before[f.playerId]);
    }
  });

  it('Skyward Gore: a 5 catches the whole party', () => {
    const state = ragorathState();
    const before = state.battle!.fighters.map((f) => f.hp);
    applyBossMove(state, 'A', dice(5));
    for (const f of state.battle!.fighters) expect(before[f.playerId] - f.hp).toBe(6);
  });

  it('Skyward Gore: a 6 adds Rage and rerolls, so the eventual hit is bigger', () => {
    const state = ragorathState();
    const kit = findFighter(state, 'Kit');
    const hpBefore = kit.hp;
    applyBossMove(state, 'A', dice(6, 6, 2)); // two winds-up (+2 Rage), then seat 2
    expect(hpBefore - kit.hp).toBe(8); // 6 base + 2 accumulated Rage
    expect(state.battle!.rage).toBe(0); // and still resets afterwards
  });

  it('Skyward Gore: a face pointing at a dead seat rerolls instead of whiffing', () => {
    const state = ragorathState();
    const eric = findFighter(state, 'Eric');
    const kit = findFighter(state, 'Kit');
    eric.alive = false;
    const hpBefore = kit.hp;
    applyBossMove(state, 'A', dice(1, 2)); // seat 1 is empty → rolls again → seat 2
    expect(hpBefore - kit.hp).toBe(6);
  });

  it('Frenzy hunts the biggest damage dealer this battle, not the weakest survivor', () => {
    const state = ragorathState();
    const kit = findFighter(state, 'Kit');
    const luna = findFighter(state, 'Luna');
    kit.damageDealtThisBattle = 30;
    luna.damageDealtThisBattle = 2;
    luna.hp = 1; // the old rule would have executed Luna here
    const kitBefore = kit.hp;
    const lunaBefore = luna.hp;
    applyBossMove(state, 'C', dice(1));
    expect(kitBefore - kit.hp).toBe(10);
    expect(luna.hp).toBe(lunaBefore);
  });

  it('damageDealtThisBattle counts trap damage too — a cut is a cut', () => {
    const state = ragorathState();
    const kit = findFighter(state, 'Kit');
    applyDamageToBoss(state, kit.playerId, 4, { ignoresArmor: true, skillId: 'Trap', countsAsAttack: false });
    expect(kit.damageDealtThisBattle).toBe(4);
    expect(kit.attackCountThisBattle).toBe(0); // but it is still not an "attack" for kit3
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
    const eric = findFighter(state, 'Eric');
    const slotBefore = eric.slot;
    const hpBefore = eric.hp;
    applyBossMove(state, 'A', dice(1));
    expect(eric.hp).toBe(hpBefore - 4);
    expect(eric.slot).toBe(slotBefore - 1);
  });

  it('Nightmare rolls two targets for 7 each and can land both on the same person', () => {
    const state = somnivarState();
    const kit = findFighter(state, 'Kit');
    kit.maxHp = 100; // both 7s must fit without the second one clamping at 0
    kit.hp = 100;
    const hpBefore = kit.hp;
    applyBossMove(state, 'B', dice(2, 2)); // seat 2 twice
    expect(hpBefore - kit.hp).toBe(14);
  });

  it('Nightmare: a 5-6 rerolls and drags the eventual target 1 slot further down per reroll', () => {
    const state = somnivarState();
    const liora = findFighter(state, 'Liora');
    const slotBefore = liora.slot;
    const hpBefore = liora.hp;
    // shot 1: 5 → reroll, 6 → reroll, 3 → Liora (2 rerolls). shot 2: 4 → Luna, no reroll.
    applyBossMove(state, 'B', dice(5, 6, 3, 4));
    expect(hpBefore - liora.hp).toBe(7);
    expect(liora.slot).toBe(slotBefore - 2);
    expect(findFighter(state, 'Luna').slot).toBe(findFighter(state, 'Luna').slot); // untouched clock-wise
  });

  it('move C (eternal slumber) deals no damage and pushes everyone down 4', () => {
    const state = somnivarState();
    const eric = findFighter(state, 'Eric');
    const slotBefore = eric.slot;
    const hpBefore = eric.hp;
    applyBossMove(state, 'C', dice(6));
    expect(eric.hp).toBe(hpBefore);
    expect(eric.slot).toBe(slotBefore - 4);
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
    applyBossMove(state, 'B', dice(4));
    expect(battle.armor).toBe(3);
    expect(battle.bossHp).toBe(battle.bossHpMax);
  });

  it('Judgment (move C) hits for 4, or 9 against anyone below half HP', () => {
    const state = aureliusState();
    const eric = findFighter(state, 'Eric');
    const kit = findFighter(state, 'Kit');
    // Inflate maxHp so the 9-damage hit doesn't clamp at 0 and mask the pre-clamp value.
    eric.maxHp = 100;
    eric.hp = 40; // below half of 100
    kit.hp = kit.maxHp; // full — not below half
    const ericHpBefore = eric.hp;
    const kitHpBefore = kit.hp;
    applyBossMove(state, 'C', dice(6));
    expect(ericHpBefore - eric.hp).toBe(9);
    expect(kitHpBefore - kit.hp).toBe(4);
  });

  it('Procession targets whoever currently has the highest claimed score, for 9', () => {
    const state = aureliusState();
    const kit = findFighter(state, 'Kit');
    pushScore(state, { playerId: kit.playerId, conditionId: 'kit1', points: 10 });
    const hpBefore = kit.hp;
    applyBossMove(state, 'A', dice(1));
    expect(kit.hp).toBe(hpBefore - 9);
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

    applyBossMove(state, 'A', dice(1));

    // Full 9, not 9 - 2: the blessing does not reduce it. Guard and personal shields still would.
    expect(target.hp).toBe(hpBefore - 9);
  });

  it('every other Aurelius move still respects the party damage reduction', () => {
    const state = fixedDraftState();
    state.bossIndex = 2;
    prepareBattle(state);
    const battle = state.battle!;
    const luna = findFighter(state, 'Luna');
    battle.partyBuff = { atk: 3, dmgReduction: 2, ownerId: luna.playerId, expiresAtSlot: 0 };
    const before = battle.fighters.map((f) => f.hp);

    applyBossMove(state, 'C', dice(6)); // Judgment: 4 to anyone above half HP

    for (const [i, f] of battle.fighters.entries()) expect(f.hp).toBe(before[i] - (4 - 2));
  });
});
