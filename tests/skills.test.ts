import { describe, it, expect } from 'vitest';
import {
  createRNG,
  prepareBattle,
  declareSkill,
  resolveFighterPending,
  processTrapsAtMarker,
  processScheduledHitsAtMarker,
  expireTimedEffectsAtMarker,
  TRAP_DELAY_SLOTS,
  resolveBossPending,
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

describe('Berserk passive (Matt, v0.4.0) — +4 damage on any attack while HP < 7, applied the instant an immediate attack is declared', () => {
  it('adds +4 to Power Strike immediately when Matt is under the threshold', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    matt.hp = 6;
    const bossHpBefore = state.battle!.bossHp;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' }, createRNG(1));
    const base = skillStats('PowerStrike', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - (base + 4));

    // Power Strike is `immediate` — nothing left for resolveFighterPending to do at Matt's next visit.
    expect(matt.pending?.resolved).toBe(true);
    const afterDeclare = state.battle!.bossHp;
    resolveFighterPending(state, matt, createRNG(1));
    expect(state.battle!.bossHp).toBe(afterDeclare); // not applied a second time
  });

  it('does not add the bonus at HP 7 or above', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    matt.hp = 7;
    const bossHpBefore = state.battle!.bossHp;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' }, createRNG(1));
    const base = skillStats('PowerStrike', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - base);
  });

  it('is recomputed on every use, not "sticky" — full HP on a later declare drops the bonus', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    matt.hp = 1;
    let bossHpBefore = state.battle!.bossHp;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Slash' }, createRNG(1));
    const slashBase = skillStats('Slash', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - (slashBase + 4));

    matt.hp = matt.maxHp; // a well-timed heal lands before Matt's next action
    bossHpBefore = state.battle!.bossHp;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' }, createRNG(1));
    const powerBase = skillStats('PowerStrike', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - powerBase); // no bonus this time
  });

  it('applies to every Matt attack, not just Power Strike — e.g. the common Slash', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    matt.hp = 1;
    const bossHpBefore = state.battle!.bossHp;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Slash' }, createRNG(1));
    const base = skillStats('Slash', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - (base + 4));
  });
});

describe("Immediate skills (v0.4.1) — attack lands at declare, not at the caster's next visit", () => {
  it('applies damage right at declare, logging DECLARE before RESOLVE_ATTACK', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const bossHpBefore = state.battle!.bossHp;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'QuickShot' }, createRNG(1));
    const base = skillStats('QuickShot', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - base);
    const lastTwo = state.battle!.log.slice(-2);
    expect(lastTwo[0].t).toBe('DECLARE');
    expect(lastTwo[1]).toMatchObject({ t: 'RESOLVE_ATTACK', dmg: base, wasted: false });
  });

  it('flags the pending action resolved, so the pawn still walks its ⏱ but a later resolveFighterPending is a no-op', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const markerBefore = state.battle!.marker;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'QuickShot' }, createRNG(1));
    expect(kit.pending?.resolved).toBe(true);
    expect(kit.slot).toBe(markerBefore - skillStats('QuickShot', false).time); // pawn still moved its full ⏱

    const bossHpAfterDeclare = state.battle!.bossHp;
    resolveFighterPending(state, kit, createRNG(1));
    expect(state.battle!.bossHp).toBe(bossHpAfterDeclare); // not applied twice
    expect(kit.pending).toBeNull(); // pawn freed for its next declare
  });

  it('a hand-built pending without the resolved flag still resolves normally at visit time', () => {
    // Guards the fallback path: anything that constructs a PendingAction directly (rather than via
    // declareSkill) still gets its damage applied the old way, at resolve.
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    kit.pending = { skillId: 'QuickShot', declaredAtSlot: 20, landedAtSlot: 18 };
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, kit, createRNG(1));
    const base = skillStats('QuickShot', false).primary!;
    expect(state.battle!.bossHp).toBe(bossHpBefore - base);
  });

  it('still resolves when its time cost puts the pawn past slot 0 (intentional rule)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    state.battle!.marker = 1;
    const bossHp = state.battle!.bossHp;
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' }, createRNG(1));
    expect(matt.slot).toBe(-3);
    expect(state.battle!.bossHp).toBe(bossHp - skillStats('PowerStrike', false).primary!);
  });
});

describe('Guard (§8 Matt, v0.3.2) — redirects an ally\'s damage onto the guardian', () => {
  it('sends a single-target boss hit to Matt instead of the ward', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));

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
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));

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

    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));
    expect(skillStats('Guard', false).secondary).toBeUndefined();
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 0 }, createRNG(1));
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, vera, rng);
    expect(state.battle!.bossHp).toBe(bossHpBefore - fireball);
  });

  it('does not affect a bystander\'s own damage', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    const kit = findFighter(state, 'Kit');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));

    const before = state.battle!.bossHp;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'QuickShot' }, createRNG(1)); // immediate
    const quickShot = skillStats('QuickShot', false);
    expect(state.battle!.bossHp).toBe(before - quickShot.primary!);
  });

  it('expires when the guardian\'s own turn comes round', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const rng = createRNG(1);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));
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
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));
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
    expect(() => declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: matt.playerId }, createRNG(1))).toThrow(
      /different, living ally/
    );
    killFighter(state, vera);
    expect(() => declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1))).toThrow(
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
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));
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
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'CounterAttack' }, createRNG(1));
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
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'CounterAttack' }, createRNG(1));
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
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'CounterAttack' }, createRNG(1));
    const bossHp = state.battle!.bossHp;
    const { applied } = dealDamageToFighterFromBoss(state, matt, 1); // floor(1*0.5) = 0
    expect(applied).toBe(0);
    expect(state.battle!.bossHp).toBe(bossHp - 9);
  });

  it('still ripostes on the hit that kills him', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'CounterAttack' }, createRNG(1));
    const bossHp = state.battle!.bossHp;
    dealDamageToFighterFromBoss(state, matt, 999);
    expect(matt.alive).toBe(false);
    // Berserk (PASSIVES.Matt) requires the attacker to still be alive, so the kill-blow riposte
    // lands at the base secondary — not boosted, even though HP was well under the threshold.
    expect(state.battle!.bossHp).toBe(bossHp - 9);
  });
});

describe("Skill Improvement passive (Kit) — separate persistent ladders, never reset, floor at 2", () => {
  it('permanently lowers Sharp Shooting\'s target by 1 per miss, no auto-success, floors at 2', () => {
    // Sharp Shooting is `immediate` (v0.4.1) — its roll happens right at declareSkill now, so the
    // rng controlling the die goes into declareSkill directly, not a later resolveFighterPending.
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const missRng = { ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>;

    const targets: (number | null)[] = [];
    for (let i = 0; i < 5; i++) {
      declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' }, missRng);
      resolveFighterPending(state, kit, missRng); // no-op if ⚡; resolves here if the A/B toggle is delayed
      const roll = state.battle!.log.filter((e) => e.t === 'ROLL' && e.purpose === 'SharpShooting weak point').at(-1)!;
      targets.push(roll.t === 'ROLL' ? roll.target : null);
    }
    // Base target is 5 (rollBaseTarget) — unlike the old per-battle ladder, there's no 5th-attempt
    // auto-success (target 0): it just floors at 2 and every miss still costs a permanent point.
    expect(targets).toEqual([5, 4, 3, 2, 2]);
    expect(state.progress[kit.playerId].rollPenalty.SharpShooting).toBe(5);
    expect(state.progress[kit.playerId].rollPenalty.Trap).toBeUndefined();
  });

  it('keeps Sharp Shooting and Trap! separate — a miss on one does not lower the other', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const missRng = { ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' }, missRng); // one miss, penalty now 1
    resolveFighterPending(state, kit, missRng);

    state.battle!.marker = 13;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Trap', trapSlot: 10 }, createRNG(1));
    state.battle!.marker = 10;
    state.battle!.bossSlot = 10;
    processTrapsAtMarker(state, missRng);
    const trapRoll = state.battle!.log.filter((e) => e.t === 'ROLL' && e.purpose === 'Trap trigger').at(-1)!;
    // Trap! still uses its own untouched base; Sharp Shooting's miss belongs only to Sharp Shooting.
    expect(trapRoll.t === 'ROLL' && trapRoll.target).toBe(skillStats('Trap', false).rollBaseTarget);
    expect(state.progress[kit.playerId].rollPenalty).toEqual({ SharpShooting: 1, Trap: 1 });
  });

  it('does not reset on a success (unlike the old per-battle ladder)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const missRng = { ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' }, missRng); // miss, penalty 1, next target 4
    resolveFighterPending(state, kit, missRng);
    expect(state.progress[kit.playerId].rollPenalty.SharpShooting).toBe(1);

    const hitRng = { ...createRNG(1), int: () => 6 } as ReturnType<typeof createRNG>;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' }, hitRng); // hits at target 4
    resolveFighterPending(state, kit, hitRng);
    expect(state.progress[kit.playerId].rollPenalty.SharpShooting).toBe(1); // untouched by the success

    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' }, missRng);
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
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 2 }, createRNG(1));
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
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Trap', trapSlot: 10 }, createRNG(1));
    expect(state.battle!.traps).toHaveLength(1);

    state.battle!.marker = 10;
    state.battle!.bossSlot = 10;
    state.battle!.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: 14, landedAtSlot: 10 };
    const bossHpBefore = state.battle!.bossHp;
    // A die below the starting target is a miss — the trap springs (slot vacated) but does
    // nothing else: no damage, and the boss's move is not delayed at all.
    processTrapsAtMarker(state, { ...createRNG(1), int: () => 1 } as ReturnType<typeof createRNG>);
    expect(state.battle!.bossHp).toBe(bossHpBefore);
    expect(state.battle!.traps).toHaveLength(0);
    expect(state.battle!.bossPending?.landedAtSlot).toBe(10); // untouched
    expect(state.battle!.bossSlot).toBe(10);
    const roll = state.battle!.log.find((e) => e.t === 'ROLL' && e.purpose === 'Trap trigger');
    expect(roll && roll.t === 'ROLL' && roll.success).toBe(false);
    const trigger = state.battle!.log.find((e) => e.t === 'RESOLVE_TRAP_TRIGGER');
    expect(trigger && trigger.t === 'RESOLVE_TRAP_TRIGGER' && trigger.dmg).toBe(0);
  });

  it('deals damage and delays the boss move by TRAP_DELAY_SLOTS when the roll passes (v0.3.9)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 13;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Trap', trapSlot: 10 }, createRNG(1));
    state.battle!.marker = 10;
    state.battle!.bossSlot = 10;
    state.battle!.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: 14, landedAtSlot: 10 };
    const bossHpBefore = state.battle!.bossHp;
    processTrapsAtMarker(state, { ...createRNG(1), int: () => 6 } as ReturnType<typeof createRNG>);
    expect(state.battle!.bossHp).toBe(bossHpBefore - 5);
    expect(state.battle!.traps).toHaveLength(0);
    // The move survives — it just lands later, and the boss pawn moves with it. That pawn move is
    // what takes the boss out of this tick's visit queue (walk.ts builds the queue after traps run),
    // so it stalls instead of re-declaring on the spot the way the old cancel let it.
    expect(state.battle!.bossPending).not.toBeNull();
    expect(state.battle!.bossPending!.landedAtSlot).toBe(10 - TRAP_DELAY_SLOTS);
    expect(state.battle!.bossSlot).toBe(10 - TRAP_DELAY_SLOTS);
    expect(state.battle!.bossPending!.moveKey).toBe('A'); // same move, not a fresh roll
    const roll = state.battle!.log.find((e) => e.t === 'ROLL' && e.purpose === 'Trap trigger');
    expect(roll && roll.t === 'ROLL' && roll.success).toBe(true);
  });

  it('the delayed move still resolves later — it is postponed, not deleted', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 13;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Trap', trapSlot: 10 }, createRNG(1));
    state.battle!.marker = 10;
    state.battle!.bossSlot = 10;
    state.battle!.bossPending = { moveKey: 'A', die: 1, declaredAtSlot: 14, landedAtSlot: 10 };
    processTrapsAtMarker(state, { ...createRNG(1), int: () => 6 } as ReturnType<typeof createRNG>);

    // Walk on to where the move was pushed to and let the boss take its turn: somebody still gets hit.
    state.battle!.marker = 10 - TRAP_DELAY_SLOTS;
    const hpBefore = state.battle!.fighters.map((f) => f.hp);
    resolveBossPending(state, createRNG(3));
    expect(state.battle!.fighters.some((f, i) => f.hp < hpBefore[i])).toBe(true);
  });

  it('expires without effect if the marker passes the slot without the boss stopping there', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 13; // slot 10 must be inside Trap!'s ⏱4 window to arm
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Trap', trapSlot: 10 }, createRNG(1));
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
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'MultiShot' }, createRNG(1));
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
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'MultiShot' }, createRNG(1));

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
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'MultiShot' }, createRNG(1));
    state.battle!.marker = 18;
    processScheduledHitsAtMarker(state);
    state.battle!.marker = 17;
    processScheduledHitsAtMarker(state);
    state.battle!.marker = 16;
    resolveFighterPending(state, kit, createRNG(1));
    expect(kit.attackCountThisBattle).toBe(3);
  });

  it('applies Blessing and Weak Point separately to every hit by design', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 20;
    state.battle!.partyBuff = { atk: 3, dmgReduction: 2, ownerId: 3, expiresAtSlot: 0 };
    state.battle!.weakPointActive = true;
    const bossHp = state.battle!.bossHp;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'MultiShot' }, createRNG(1));
    state.battle!.marker = 18;
    processScheduledHitsAtMarker(state); // 2 + 3 + 4 = 9
    state.battle!.marker = 17;
    processScheduledHitsAtMarker(state); // 3 + 3 + 4 = 10
    state.battle!.marker = 16;
    resolveFighterPending(state, kit, createRNG(1)); // 4 + 3 + 4 = 11
    expect(state.battle!.bossHp).toBe(bossHp - 30);
    expect(kit.attackCountThisBattle).toBe(3);
  });

  it('cancels every unfired hit immediately when its owner dies mid-flight', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 20;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'MultiShot' }, createRNG(1));

    let bossHp = state.battle!.bossHp;
    state.battle!.marker = 18;
    processScheduledHitsAtMarker(state); // first early hit lands normally, Kit still alive
    expect(state.battle!.bossHp).toBe(bossHp - 2);

    killFighter(state, kit); // Kit dies before the second scheduled hit's slot
    expect(state.battle!.scheduledHits).toHaveLength(0); // cancelled now, not merely skipped later

    bossHp = state.battle!.bossHp;
    state.battle!.marker = 17;
    processScheduledHitsAtMarker(state);
    expect(state.battle!.bossHp).toBe(bossHp); // no damage — the hit no longer exists

    // The primary hit is already cancelled too — killFighter clears fighter.pending on death, and
    // resolveFighterPending's `if (!pending) return;` guard stops it from ever running.
    expect(kit.pending).toBeNull();
  });

  it('does not resume a cancelled Multi Shot after Kit revives', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    state.battle!.marker = 20;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'MultiShot' }, createRNG(1));
    killFighter(state, kit);
    kit.alive = true;
    kit.hp = 5;

    const bossHp = state.battle!.bossHp;
    state.battle!.marker = 18;
    processScheduledHitsAtMarker(state);
    state.battle!.marker = 17;
    processScheduledHitsAtMarker(state);
    expect(state.battle!.bossHp).toBe(bossHp);
    expect(state.battle!.scheduledHits).toHaveLength(0);
  });
});

describe('Blessing — fixed four-slot lifetime', () => {
  it('expires exactly four marker steps after declare, independent of Luna pending', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    state.battle!.marker = 20;
    declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Blessing' }, createRNG(1));
    expect(state.battle!.partyBuff?.expiresAtSlot).toBe(16);

    for (const marker of [19, 18, 17]) {
      state.battle!.marker = marker;
      expireTimedEffectsAtMarker(state);
      expect(state.battle!.partyBuff).not.toBeNull();
    }
    state.battle!.marker = 16;
    expireTimedEffectsAtMarker(state);
    expect(state.battle!.partyBuff).toBeNull();
    expect(luna.pending).not.toBeNull(); // duration is not implemented by clearing Luna's action
  });

  it('still expires on its fixed clock even if Luna dies', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    state.battle!.marker = 20;
    declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Blessing' }, createRNG(1));
    killFighter(state, luna);
    expect(state.battle!.partyBuff).not.toBeNull();

    state.battle!.marker = 16;
    expireTimedEffectsAtMarker(state);
    expect(state.battle!.partyBuff).toBeNull();
  });
});

describe('ManaCharge passive (Vera, v0.4.0) — Aura Charge grants +1 mana the instant it is declared', () => {
  it('grants +1 mana on declaring Aura Charge', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    expect(vera.mana).toBe(0);
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'AuraCharge' }, createRNG(1));
    expect(vera.mana).toBe(1);
  });

  it('does not trigger on Vera\'s damaging skills', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 0 }, createRNG(1));
    expect(vera.mana).toBe(0);
  });

  it('caps at 3', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    vera.mana = 3;
    declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'AuraCharge' }, createRNG(1));
    expect(vera.mana).toBe(3);
  });

  it("does not fire for other characters' non-damaging skills (e.g. Matt's Guard)", () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));
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
    declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Heal', targetPlayerId: matt.playerId }, createRNG(1));
    killFighter(state, matt);
    resolveFighterPending(state, luna, rng);
    const last = state.battle!.log.at(-1);
    expect(last).toMatchObject({ t: 'RESOLVE_HEAL', wasted: true, amount: 0 });
  });
});
