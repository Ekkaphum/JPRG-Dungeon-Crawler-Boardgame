import { describe, it, expect } from 'vitest';
import {
  createRNG,
  prepareBattle,
  declareSkill,
  resolveFighterPending,
  processTrapsAtMarker,
  processScheduledHitsAtMarker,
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

describe('Berserk passive (Matt, v0.4.0) — +4 damage on any attack while HP < 7, checked at resolve', () => {
  it('adds +4 to Power Strike when Matt is under the threshold at resolve', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    matt.hp = 6;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' });
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, matt, rng);
    const base = skillStats('PowerStrike', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - (base + 4));
  });

  it('does not add the bonus at HP 7 or above', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    matt.hp = 7;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' });
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, matt, rng);
    const base = skillStats('PowerStrike', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - base);
  });

  it('is checked at resolve, not declare — a heal above the threshold before it lands removes the bonus', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    matt.hp = 4;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' });
    matt.hp = 12; // a well-meaning Luna heal lands first
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, matt, rng);
    const base = skillStats('PowerStrike', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - base);
  });

  it('applies to every Matt attack, not just Power Strike — e.g. the common Slash', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    matt.hp = 1;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Slash' });
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, matt, rng);
    const base = skillStats('Slash', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - (base + 4));
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

  it('no longer buffs the ward\'s attack (v0.4.0 dropped the secondary/wardAtk — pure protection now)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    const fireball = skillStats('Fireball', false).primary!;

    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId });
    expect(skillStats('Guard', false).secondary).toBeUndefined();
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 0 });
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, vera, rng);
    expect(state.battle!.bossHp).toBe(bossHpBefore - fireball);
  });

  it('does not affect a bystander\'s own damage', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    const kit = findFighter(state, 'Kit');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId });

    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'QuickShot' });
    const before = state.battle!.bossHp;
    resolveFighterPending(state, kit, rng);
    const quickShot = skillStats('QuickShot', false);
    expect(state.battle!.bossHp).toBe(before - quickShot.primary!);
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
    expect(state.battle!.bossHp).toBe(bossHp - 9); // riposte lands right away, not on his turn

    // A second hit in the same window answers again — the shield is not consumed.
    bossHp = state.battle!.bossHp;
    dealDamageToFighterFromBoss(state, matt, 6);
    expect(state.battle!.bossHp).toBe(bossHp - 9);
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
    expect(state.battle!.bossHp).toBe(bossHp - 9);
  });

  it('still ripostes on the hit that kills him', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'CounterAttack' });
    const bossHp = state.battle!.bossHp;
    dealDamageToFighterFromBoss(state, matt, 999);
    expect(matt.alive).toBe(false);
    // Berserk (PASSIVES.Matt) requires the attacker to still be alive, so the kill-blow riposte
    // lands at the base secondary — not boosted, even though HP was well under the threshold.
    expect(state.battle!.bossHp).toBe(bossHp - 9);
  });
});

describe("Skill Improvement passive (Kit, v0.4.0) — persistent roll penalty, never resets, floors at 2", () => {
  it('permanently lowers Sharp Shooting\'s target by 1 per miss, no auto-success, floors at 2', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const missRng = { ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>;

    const targets: (number | null)[] = [];
    for (let i = 0; i < 5; i++) {
      declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' });
      resolveFighterPending(state, kit, missRng);
      const roll = state.battle!.log.filter((e) => e.t === 'ROLL' && e.purpose === 'SharpShooting weak point').at(-1)!;
      targets.push(roll.t === 'ROLL' ? roll.target : null);
    }
    // Base target is 5 (rollBaseTarget) — unlike the old per-battle ladder, there's no 5th-attempt
    // auto-success (target 0): it just floors at 2 and every miss still costs a permanent point.
    expect(targets).toEqual([5, 4, 3, 2, 2]);
    expect(state.progress[kit.playerId].rollPenalty).toBe(5);
  });

  it('is shared between Sharp Shooting and Trap! — a miss on one lowers the other\'s target too', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const missRng = { ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' });
    resolveFighterPending(state, kit, missRng); // one miss, penalty now 1

    state.battle!.marker = 13;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Trap', trapSlot: 10 });
    state.battle!.marker = 10;
    state.battle!.bossSlot = 10;
    processTrapsAtMarker(state, missRng);
    const trapRoll = state.battle!.log.filter((e) => e.t === 'ROLL' && e.purpose === 'Trap trigger').at(-1)!;
    // Trap!'s own base is 6 — discounted by the 1 penalty Sharp Shooting's miss already banked.
    expect(trapRoll.t === 'ROLL' && trapRoll.target).toBe(5);
  });

  it('does not reset on a success (unlike the old per-battle ladder)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const missRng = { ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' });
    resolveFighterPending(state, kit, missRng); // miss, penalty 1, next target 4
    expect(state.progress[kit.playerId].rollPenalty).toBe(1);

    const hitRng = { ...createRNG(1), int: () => 6 } as ReturnType<typeof createRNG>;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' });
    resolveFighterPending(state, kit, hitRng); // hits at target 4
    expect(state.progress[kit.playerId].rollPenalty).toBe(1); // untouched by the success

    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' });
    resolveFighterPending(state, kit, missRng);
    const roll = state.battle!.log.filter((e) => e.t === 'ROLL' && e.purpose === 'SharpShooting weak point').at(-1)!;
    expect(roll.t === 'ROLL' && roll.target).toBe(4); // still discounted, not reset to base 5
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

describe('Trap! (§9 Kit, v0.4.0) — placed immediately, triggers only on an exact stop', () => {
  it('rolls first: a miss deals no damage and does not cancel the boss pending action', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    // Trap! is ⏱4, so slot 10 is only armable from marker 11–13 (see tests/trapSlots.test.ts).
    state.battle!.marker = 13;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Trap', trapSlot: 10 });
    expect(state.battle!.traps).toHaveLength(1);

    state.battle!.marker = 10;
    state.battle!.bossSlot = 10;
    state.battle!.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: 14, landedAtSlot: 10 };
    const bossHpBefore = state.battle!.bossHp;
    // A die below the 6+ starting target is a miss — the trap springs (slot vacated) but does
    // nothing else: no damage, no cancel.
    processTrapsAtMarker(state, { ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>);
    expect(state.battle!.bossHp).toBe(bossHpBefore);
    expect(state.battle!.traps).toHaveLength(0);
    expect(state.battle!.bossPending).not.toBeNull();
    const roll = state.battle!.log.find((e) => e.t === 'ROLL' && e.purpose === 'Trap trigger');
    expect(roll && roll.t === 'ROLL' && roll.success).toBe(false);
    const trigger = state.battle!.log.find((e) => e.t === 'RESOLVE_TRAP_TRIGGER');
    expect(trigger && trigger.t === 'RESOLVE_TRAP_TRIGGER' && trigger.dmg).toBe(0);
  });

  it('deals damage and cancels the boss pending action only when the roll passes', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 13;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Trap', trapSlot: 10 });
    state.battle!.marker = 10;
    state.battle!.bossSlot = 10;
    state.battle!.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: 14, landedAtSlot: 10 };
    const bossHpBefore = state.battle!.bossHp;
    processTrapsAtMarker(state, { ...createRNG(1), int: () => 6 } as ReturnType<typeof createRNG>);
    expect(state.battle!.bossHp).toBe(bossHpBefore - 5);
    expect(state.battle!.traps).toHaveLength(0);
    expect(state.battle!.bossPending).toBeNull();
    const roll = state.battle!.log.find((e) => e.t === 'ROLL' && e.purpose === 'Trap trigger');
    expect(roll && roll.t === 'ROLL' && roll.success).toBe(true);
  });

  it('expires without effect if the marker passes the slot without the boss stopping there', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 13; // slot 10 must be inside Trap!'s ⏱4 window to arm
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Trap', trapSlot: 10 });
    state.battle!.marker = 10;
    state.battle!.bossSlot = 6; // boss is headed elsewhere, not stopping at 10
    const bossHpBefore = state.battle!.bossHp;
    processTrapsAtMarker(state, createRNG(1));
    expect(state.battle!.bossHp).toBe(bossHpBefore);
    expect(state.battle!.traps).toHaveLength(0);
  });
});

describe('Multi Shot (Kit, v0.4.0) — one hit at resolve + two scheduled early hits', () => {
  it('schedules the two early hits at declare time, at the right slots and damage', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 20;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'MultiShot' });
    expect(state.battle!.scheduledHits).toEqual([
      { slot: 18, dmg: 2, ownerId: kit.playerId, skillId: 'MultiShot' },
      { slot: 17, dmg: 3, ownerId: kit.playerId, skillId: 'MultiShot' },
    ]);
    expect(kit.pending?.landedAtSlot).toBe(16); // the primary (4 dmg) hit resolves here
  });

  it('fires each early hit unconditionally when the marker reaches its slot, then the primary hit resolves normally', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 20;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'MultiShot' });

    let bossHp = state.battle!.bossHp;
    state.battle!.marker = 18;
    processScheduledHitsAtMarker(state);
    expect(state.battle!.bossHp).toBe(bossHp - 2);
    expect(state.battle!.scheduledHits).toHaveLength(1);

    bossHp = state.battle!.bossHp;
    state.battle!.marker = 17;
    processScheduledHitsAtMarker(state);
    expect(state.battle!.bossHp).toBe(bossHp - 3);
    expect(state.battle!.scheduledHits).toHaveLength(0);

    bossHp = state.battle!.bossHp;
    state.battle!.marker = 16;
    resolveFighterPending(state, kit, createRNG(1));
    expect(state.battle!.bossHp).toBe(bossHp - 4);
  });

  it('every hit — early and primary alike — counts toward attackCountThisBattle (kit3)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 20;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'MultiShot' });
    state.battle!.marker = 18;
    processScheduledHitsAtMarker(state);
    state.battle!.marker = 17;
    processScheduledHitsAtMarker(state);
    state.battle!.marker = 16;
    resolveFighterPending(state, kit, createRNG(1));
    expect(kit.attackCountThisBattle).toBe(3);
  });
});

describe('ManaCharge passive (Vera, v0.4.0) — Aura Charge grants +1 mana the instant it is declared', () => {
  it('grants +1 mana on declaring Aura Charge', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    expect(vera.mana).toBe(0);
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'AuraCharge' });
    expect(vera.mana).toBe(1);
  });

  it('does not trigger on Vera\'s damaging skills', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 0 });
    expect(vera.mana).toBe(0);
  });

  it('caps at 3', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    vera.mana = 3;
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'AuraCharge' });
    expect(vera.mana).toBe(3);
  });

  it("does not fire for other characters' non-damaging skills (e.g. Matt's Guard)", () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId });
    expect(vera.mana).toBe(0);
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
