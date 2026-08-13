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
import { skillStats } from '@content/characters';
import { fixedDraftState } from './testUtils';

function findFighter(state: ReturnType<typeof fixedDraftState>, charId: string) {
  const player = state.players.find((p) => p.charId === charId)!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

describe('Slash — the HP<=5 damage tier is picked at resolve (v0.3.2, was Berserk)', () => {
  it('drops back to the base number if healed above 5 before it resolves — downgraded, not wasted', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    matt.hp = 4;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Slash' });
    matt.hp = 12; // a well-meaning Luna heal lands first
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, matt, rng);
    // 6, not 11, and emphatically not 0: folding Berserk into Slash means the heal costs Matt the
    // boost (and matt1's ">10 in one hit"), never the whole action.
    expect(state.battle!.bossHp).toBe(bossHpBefore - 6);
    expect(state.battle!.log.at(-1)).toMatchObject({ t: 'RESOLVE_ATTACK', dmg: 6, wasted: false });
  });

  it('uses the boosted number when still at/below the tier at resolve', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    matt.hp = 3;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Slash' });
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, matt, rng);
    expect(state.battle!.bossHp).toBe(bossHpBefore - 11);
  });

  it('is declarable at any HP — the tier is a bonus, no longer a gate', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    matt.hp = matt.maxHp;
    expect(() => declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Slash' })).not.toThrow();
  });

  it('clears matt1 (">10 damage in one hit") unbuffed at the boosted tier, but not at the base one', () => {
    // The exact reason Slash's secondary is 11 and not 10 — see src/content/characters.ts.
    expect(skillStats('Slash', false).secondary!).toBeGreaterThan(10);
    expect(skillStats('Slash', false).primary!).toBeLessThanOrEqual(10);
  });
});

describe('Guard (§8 Matt, v0.3.2) — redirects an ally\'s damage onto the guardian', () => {
  it('sends a single-target boss hit to Matt instead of the ward', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId });

    const reduction = skillStats('Guard', false).primary!;
    const mattHp = matt.hp;
    const veraHp = vera.hp;
    const { applied, recipient } = dealDamageToFighterFromBoss(state, vera, 10);
    expect(recipient.playerId).toBe(matt.playerId);
    expect(applied).toBe(10 - reduction); // the reduction is what makes absorbing it worth an action
    expect(vera.hp).toBe(veraHp); // untouched
    expect(matt.hp).toBe(mattHp - (10 - reduction));
  });

  it('reduces only the redirected hit, never the guardian\'s own share of an AoE', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    const reduction = skillStats('Guard', false).primary!;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId });

    const mattHp = matt.hp;
    dealDamageToFighterFromBoss(state, matt, 10); // his own share — full price
    dealDamageToFighterFromBoss(state, vera, 10); // hers, redirected and reduced
    expect(matt.hp).toBe(mattHp - 10 - (10 - reduction));
    expect(vera.hp).toBe(vera.maxHp);
  });

  it('gives the ward an attack buff — the reason Guard can pay its own ⏱', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    const wardAtk = skillStats('Guard', false).secondary!;
    const fireball = skillStats('Fireball', false).primary!;

    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId });
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 0 });
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, vera, rng);
    expect(state.battle!.bossHp).toBe(bossHpBefore - (fireball + wardAtk));
  });

  it('buffs only the ward, not the guardian and not a bystander', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    const kit = findFighter(state, 'Kit');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId });

    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'TwinShot' });
    const before = state.battle!.bossHp;
    resolveFighterPending(state, kit, rng);
    const twin = skillStats('TwinShot', false);
    expect(state.battle!.bossHp).toBe(before - twin.primary! * twin.secondary!);
  });

  it('expires when the guardian\'s own turn comes round', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId });
    expect(state.battle!.guard).not.toBeNull();

    resolveFighterPending(state, matt, rng);
    expect(state.battle!.guard).toBeNull();
    const veraHp = vera.hp;
    dealDamageToFighterFromBoss(state, vera, 5);
    expect(vera.hp).toBe(veraHp - 5); // back to taking her own hits
  });

  it('drops the link when the guardian dies, so the ward is exposed again', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId });
    killFighter(state, matt);
    expect(state.battle!.guard).toBeNull();

    const veraHp = vera.hp;
    const { recipient } = dealDamageToFighterFromBoss(state, vera, 5);
    expect(recipient.playerId).toBe(vera.playerId);
    expect(vera.hp).toBe(veraHp - 5);
  });

  it('rejects guarding yourself, and guarding the dead', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    expect(() => declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: matt.playerId })).toThrow(
      /different, living ally/
    );
    killFighter(state, vera);
    expect(() => declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId })).toThrow(
      /different, living ally/
    );
  });

  it('lets the redirected hit trigger the guardian\'s own Counter, not the ward\'s', () => {
    // Guard and Counter can never overlap on Matt himself (declaring one ends the other), but a
    // guarded *ward* running their own counter shield must not riposte off a hit they never took.
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId });
    vera.shield = { kind: 'counter', reduction: 50, counterDmg: 12, hitDuringWindow: false };

    const bossHpBefore = state.battle!.bossHp;
    dealDamageToFighterFromBoss(state, vera, 6);
    expect(state.battle!.bossHp).toBe(bossHpBefore); // no riposte — Vera was never hit
    expect(vera.shield?.hitDuringWindow).toBe(false);
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
    const { applied } = dealDamageToFighterFromBoss(state, matt, 6);
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
    const { applied } = dealDamageToFighterFromBoss(state, matt, 1); // floor(1*0.5) = 0
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
  it('rolls first: a miss deals no damage and does not cancel the boss pending action', () => {
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
    // A die below the 5+ starting target is a miss — the trap springs (slot vacated) but does
    // nothing else: no damage, no cancel.
    processTrapsAtMarker(state, { ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>);
    expect(state.battle!.bossHp).toBe(bossHpBefore);
    expect(state.battle!.traps).toHaveLength(0);
    expect(state.battle!.bossPending).not.toBeNull();
    const roll = state.battle!.log.find((e) => e.t === 'ROLL' && e.purpose === 'SetTrap trigger');
    expect(roll && roll.t === 'ROLL' && roll.success).toBe(false);
    const trigger = state.battle!.log.find((e) => e.t === 'RESOLVE_TRAP_TRIGGER');
    expect(trigger && trigger.t === 'RESOLVE_TRAP_TRIGGER' && trigger.dmg).toBe(0);
  });

  it('deals damage and cancels the boss pending action only when the roll passes', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 13;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SetTrap', trapSlot: 10 });
    state.battle!.marker = 10;
    state.battle!.bossSlot = 10;
    state.battle!.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: 14, landedAtSlot: 10 };
    const bossHpBefore = state.battle!.bossHp;
    processTrapsAtMarker(state, { ...createRNG(1), int: () => 6 } as ReturnType<typeof createRNG>);
    expect(state.battle!.bossHp).toBe(bossHpBefore - 4);
    expect(state.battle!.traps).toHaveLength(0);
    expect(state.battle!.bossPending).toBeNull();
    const roll = state.battle!.log.find((e) => e.t === 'ROLL' && e.purpose === 'SetTrap trigger');
    expect(roll && roll.t === 'ROLL' && roll.success).toBe(true);
  });

  it('eases the roll target after a miss, same escalating ladder as Quick Shot', () => {
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
      return state.battle!.log.filter((e) => e.t === 'ROLL' && e.purpose === 'SetTrap trigger').at(-1)!;
    };

    // Force a miss: a die below the 5+ starting target leaves the move standing.
    const miss = armAndTrigger({ ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>);
    expect(miss.t === 'ROLL' && miss.target).toBe(5);
    expect(miss.t === 'ROLL' && miss.success).toBe(false);
    expect(state.battle!.bossPending).not.toBeNull();

    // Next attempt is one easier, and a passing roll both deals damage and wipes the declared move.
    const bossHpBeforeSecond = state.battle!.bossHp;
    const hit = armAndTrigger({ ...createRNG(1), int: () => 4 } as ReturnType<typeof createRNG>);
    expect(hit.t === 'ROLL' && hit.target).toBe(4);
    expect(hit.t === 'ROLL' && hit.success).toBe(true);
    expect(state.battle!.bossPending).toBeNull();
    expect(state.battle!.bossHp).toBe(bossHpBeforeSecond - 4);
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
