import { describe, it, expect } from 'vitest';
import {
  createRNG,
  prepareBattle,
  declareSkill,
  resolveFighterPending,
  processTrapsAtMarker,
  applyDamageToFighter,
  dealDamageToFighterFromBoss,
  killFighter,
} from '@engine/index';
import { fixedDraftState } from './testUtils';

function findFighter(state: ReturnType<typeof fixedDraftState>, charId: string) {
  const player = state.players.find((p) => p.charId === charId)!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

describe('Berserk — HP<=5 gate re-checked at resolve (§5.5)', () => {
  it('is wasted if healed above 5 before it resolves', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    matt.hp = 4;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Berserk' });
    matt.hp = 12; // healed back up before resolve
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, matt, rng);
    expect(state.battle!.bossHp).toBe(bossHpBefore);
    const last = state.battle!.log.at(-1);
    expect(last).toMatchObject({ t: 'RESOLVE_ATTACK', wasted: true });
  });

  it('deals damage when the gate is still satisfied at resolve', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    matt.hp = 3;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Berserk' });
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, matt, rng);
    expect(state.battle!.bossHp).toBeLessThan(bossHpBefore);
  });
});

describe('Counter Attack (§8 Matt) — immediate shield, conditional counter-strike', () => {
  it('halves damage taken and ripostes immediately, once per incoming hit', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'CounterAttack' });
    expect(matt.shield?.kind).toBe('counter');

    let bossHp = state.battle!.bossHp;
    const applied = dealDamageToFighterFromBoss(state, matt, 6);
    expect(applied).toBe(3); // floor(6 * 0.5)
    expect(state.battle!.bossHp).toBe(bossHp - 12); // riposte lands right away, not on his turn

    // A second hit in the same window answers again — the shield is not consumed.
    bossHp = state.battle!.bossHp;
    dealDamageToFighterFromBoss(state, matt, 6);
    expect(state.battle!.bossHp).toBe(bossHp - 12);
    expect(matt.shield?.kind).toBe('counter');
  });

  it('reaching his own turn just ends the window, with no extra strike', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(2);
    const matt = findFighter(state, 'Matt');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'CounterAttack' });
    dealDamageToFighterFromBoss(state, matt, 6); // already answered

    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, matt, rng);
    expect(state.battle!.bossHp).toBe(bossHpBefore); // no second payout
    expect(matt.shield).toBeNull();
  });

  it('ripostes even when the reduced damage rounds to 0 (§8)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'CounterAttack' });
    const bossHp = state.battle!.bossHp;
    const applied = dealDamageToFighterFromBoss(state, matt, 1); // floor(1*0.5) = 0
    expect(applied).toBe(0);
    expect(state.battle!.bossHp).toBe(bossHp - 12);
  });

  it('still ripostes on the hit that kills him', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'CounterAttack' });
    const bossHp = state.battle!.bossHp;
    dealDamageToFighterFromBoss(state, matt, 999);
    expect(matt.alive).toBe(false);
    expect(state.battle!.bossHp).toBe(bossHp - 12);
  });
});

describe('Quick Shot dice ladder (§5.2)', () => {
  it('the 5th attempt since a success always auto-succeeds', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(7);
    const kit = findFighter(state, 'Kit');
    for (let i = 0; i < 6; i++) {
      declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'QuickShot' });
      resolveFighterPending(state, kit, rng);
    }
    const rolls = state.battle!.log.filter((e) => e.t === 'ROLL' && e.purpose.includes('QuickShot'));
    for (const r of rolls) {
      if (r.t === 'ROLL' && r.target === null) expect(r.success).toBe(true);
    }
  });
});

describe('Vera mana — paid immediately at declare, never refunded (§5.1/§8)', () => {
  it('deducts mana as soon as Fireball is declared', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    vera.mana = 3;
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 2 });
    expect(vera.mana).toBe(1);
  });
});

describe('Set Trap (§9 Kit) — placed immediately, triggers only on an exact stop', () => {
  it('deals damage and cancels the boss pending action when the boss stops on it', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    // Set Trap is ⏱4, so slot 10 is only armable from marker 11–13 (see tests/trapSlots.test.ts).
    state.battle!.marker = 13;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SetTrap', trapSlot: 10 });
    expect(state.battle!.traps).toHaveLength(1);

    state.battle!.marker = 10;
    state.battle!.bossSlot = 10;
    state.battle!.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: 14, landedAtSlot: 10 };
    const bossHpBefore = state.battle!.bossHp;
    processTrapsAtMarker(state, createRNG(1));
    expect(state.battle!.bossHp).toBe(bossHpBefore - 4);
    expect(state.battle!.traps).toHaveLength(0);
    // The cancel is a dice check now, so it either fired or bumped the ladder for next time.
    const roll = state.battle!.log.find((e) => e.t === 'ROLL' && e.purpose === 'Trap cancel');
    expect(roll).toBeDefined();
  });

  it('cancels the boss move only when the ladder roll passes, and eases the target after a miss', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');

    const armAndTrigger = (rng: ReturnType<typeof createRNG>) => {
      // Rewind the marker so slot 10 sits inside Set Trap's ⏱4 window before each re-arm.
      state.battle!.marker = 13;
      declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SetTrap', trapSlot: 10 });
      state.battle!.marker = 10;
      state.battle!.bossSlot = 10;
      state.battle!.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: 14, landedAtSlot: 10 };
      processTrapsAtMarker(state, rng);
      return state.battle!.log.filter((e) => e.t === 'ROLL' && e.purpose === 'Trap cancel').at(-1)!;
    };

    // Force a miss: a die below the 5+ starting target leaves the move standing.
    const miss = armAndTrigger({ ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>);
    expect(miss.t === 'ROLL' && miss.target).toBe(5);
    expect(miss.t === 'ROLL' && miss.success).toBe(false);
    expect(state.battle!.bossPending).not.toBeNull();

    // Next attempt is one easier, and a passing roll wipes the declared move.
    const hit = armAndTrigger({ ...createRNG(1), int: () => 6 } as ReturnType<typeof createRNG>);
    expect(hit.t === 'ROLL' && hit.target).toBe(4);
    expect(hit.t === 'ROLL' && hit.success).toBe(true);
    expect(state.battle!.bossPending).toBeNull();
    expect(kit.rollAttempt.SetTrap).toBe(0); // reset on success
  });

  it('expires without effect if the marker passes the slot without the boss stopping there', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 13; // slot 10 must be inside Set Trap's ⏱4 window to arm
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SetTrap', trapSlot: 10 });
    state.battle!.marker = 10;
    state.battle!.bossSlot = 6; // boss is headed elsewhere, not stopping at 10
    const bossHpBefore = state.battle!.bossHp;
    processTrapsAtMarker(state, createRNG(1));
    expect(state.battle!.bossHp).toBe(bossHpBefore);
    expect(state.battle!.traps).toHaveLength(0);
  });
});

describe('Heal — target invalid at resolve = wasted for free (§5.5)', () => {
  it('fizzles if the target died before Heal resolves', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(4);
    const luna = findFighter(state, 'Luna');
    const matt = findFighter(state, 'Matt');
    declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Heal', targetPlayerId: matt.playerId });
    killFighter(state, matt);
    resolveFighterPending(state, luna, rng);
    const last = state.battle!.log.at(-1);
    expect(last).toMatchObject({ t: 'RESOLVE_HEAL', wasted: true, amount: 0 });
  });
});
