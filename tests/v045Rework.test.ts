// v0.4.5 character rework. Every test here does two things: it pins the new rule, and — where the
// rule replaces an older one — it asserts the *v0.3 behaviour is unchanged in the same breath*.
// That pairing is the point of the file: the rework's whole safety argument is that it lives behind
// hasV045Content() and cannot reach a stable game, and a claim like that is only worth what its
// tests are worth.

import { describe, expect, it } from 'vitest';
import { createRNG, prepareBattle, type GameState } from '@engine/index';
import { declareSkill, resolveFighterPending, springTrapOnBoss } from '@engine/clock/skills';
import { applyDamageToBoss, applyDamageToFighter, computeOutgoingPlayerDamage, pushScore } from '@engine/clock/damage';
import { onBattleEndScoring, onGuardRedirected, onHealResolved, onPlayerDealtDamage } from '@engine/clock/scoring';
import { applyAilment } from '@engine/clock/ailments';
import {
  charPassive,
  V045_ERIC_GUARD_SAVES_BAR,
  V045_LUNA1_HEAL_HP_PCT,
  V045_LUNA_MANA_PER_BOSS_DAMAGE,
  V045_LUNA_START_MANA,
  V045_SLOW_BOSS_SLOTS,
  charSkills,
  skillDefFor,
  skillStats,
} from '@content/characters';
import { fixedDraftState } from './testUtils';

/** A v0.4.5 battle with the fixed Eric/Kit/Liora/Luna → player 0..3 assignment. */
function reworkState(seed = 999): GameState {
  const state = fixedDraftState(seed);
  state.ruleset = 'v0.4';
  prepareBattle(state);
  return state;
}

/** The same, under the stable ruleset — the control for every "and v0.3 is untouched" assertion. */
function stableState(seed = 999): GameState {
  const state = fixedDraftState(seed);
  prepareBattle(state);
  return state;
}

const ERIC = 0;
const KIT = 1;
const LIORA = 2;
const LUNA = 3;

const fighterOf = (state: GameState, id: number) => state.battle!.fighters.find((f) => f.playerId === id)!;

describe('v0.4.5 — kits are ruleset-scoped', () => {
  it('hands Kit, Liora and Luna different cards while leaving Eric and v0.3 alone', () => {
    expect(charSkills('Kit', 'v0.4')).toEqual(['SightingShot', 'SharpShooting', 'Trap', 'MultiShot']);
    expect(charSkills('Liora', 'v0.4')).toEqual(['ManaDrain', 'Freeze', 'AuraShield', 'Meteor']);
    expect(charSkills('Luna', 'v0.4')).toEqual(['HolySmite', 'Praying', 'Heal', 'Blessing']);
    // Eric's rework is numbers and scoring only, so his card list is deliberately identical.
    expect(charSkills('Eric', 'v0.4')).toEqual(charSkills('Eric', 'v0.3'));

    expect(charSkills('Kit', 'v0.3')).toEqual(['QuickShot', 'SharpShooting', 'Trap', 'MultiShot']);
    expect(charSkills('Liora', 'v0.3')).toEqual(['AirPush', 'Fireball', 'AuraCharge', 'Meteor']);
    expect(charSkills('Luna', 'v0.3')).toEqual(['Hitting', 'AuraSmite', 'Blessing', 'Heal']);
  });

  it('reprices the shared cards without touching their v0.3 numbers', () => {
    expect(skillStats('Slash', false, 'v0.4').primary).toBe(4);
    expect(skillStats('Slash', false, 'v0.3').primary).toBe(3);
    expect(skillStats('PowerStrike', false, 'v0.4').primary).toBe(7);
    expect(skillStats('PowerStrike', false, 'v0.3').primary).toBe(6);
    // Blessing swaps its emphasis: attack down, armor up.
    expect(skillStats('Blessing', false, 'v0.4')).toMatchObject({ primary: 2, secondary: 3 });
    expect(skillStats('Blessing', false, 'v0.3')).toMatchObject({ primary: 3, secondary: 2 });
    // Riders are ruleset-scoped too, not just numbers.
    expect(skillDefFor('Heal', 'v0.4').manaCost).toBe(2);
    expect(skillDefFor('Heal', 'v0.3').manaCost).toBeUndefined();
    expect(skillDefFor('PowerStrike', 'v0.4').selfHpCost).toBe(1);
    expect(skillDefFor('PowerStrike', 'v0.3').selfHpCost).toBeUndefined();
  });
});

describe('v0.4.5 — Eric', () => {
  it('bleeds 1 HP per Power Strike, and that HP is what carries him into Berserk', () => {
    const state = reworkState();
    const eric = fighterOf(state, ERIC);
    eric.hp = 9; // maxHp 16, so one below-half step away from Berserk's new bar of 8
    const before = state.battle!.bossHp;

    declareSkill(state, eric, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' }, createRNG(1));

    expect(eric.hp).toBe(8);
    // Power Strike is ⚡ immediate, so the cost is paid and the hit resolves inside the same
    // declare. At 8/16 he is exactly at half, which is NOT below it — no Berserk yet.
    expect(before - state.battle!.bossHp).toBe(7);
  });

  it('refuses the swing rather than letting its own cost kill him', () => {
    const state = reworkState();
    const eric = fighterOf(state, ERIC);
    eric.hp = 1;
    expect(() => declareSkill(state, eric, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' }, createRNG(1))).toThrow(/HP cost/);
    expect(eric.alive).toBe(true);
  });

  it('moves Berserk from a flat 7 to half of max HP', () => {
    const rework = reworkState();
    const stable = stableState();
    // 7 HP of 16 is below half (8) but not below the flat 7 — the one HP value where the two
    // rulesets disagree, which is exactly what makes it the right value to test.
    fighterOf(rework, ERIC).hp = 7;
    fighterOf(stable, ERIC).hp = 7;
    expect(computeOutgoingPlayerDamage(rework.battle!, 10, ERIC, 'v0.4')).toBe(14);
    expect(computeOutgoingPlayerDamage(stable.battle!, 10, ERIC, 'v0.3')).toBe(10);
  });

  it('pays eric2 once, on the redirect that reaches the bar — not per save', () => {
    const state = reworkState();
    const eric = fighterOf(state, ERIC);
    expect(V045_ERIC_GUARD_SAVES_BAR).toBe(2);

    onGuardRedirected(state, ERIC);
    expect(state.scoreLog.filter((e) => e.conditionId === 'eric2')).toHaveLength(0);
    onGuardRedirected(state, ERIC);
    expect(state.scoreLog.filter((e) => e.conditionId === 'eric2')).toHaveLength(1);
    // Further saves are their own reward — the whole point of the threshold is that it cannot be
    // inflated by a boss that simply acts more often.
    onGuardRedirected(state, ERIC);
    onGuardRedirected(state, ERIC);
    expect(state.scoreLog.filter((e) => e.conditionId === 'eric2')).toHaveLength(1);
    expect(eric.guardRedirectsThisBattle).toBe(4);
    expect(state.scoreLog.find((e) => e.conditionId === 'eric2')!.points).toBe(3);
  });

  it('pays eric3 for surviving alone, where v0.3 also demanded he was beaten down first', () => {
    for (const [state, expected] of [
      [reworkState(), 1],
      [stableState(), 0],
    ] as const) {
      state.battle!.outcome = 'boss_defeated';
      const eric = fighterOf(state, ERIC);
      eric.everDiedThisBattle = false;
      eric.everDroppedBelowHalfThisBattle = false; // never took a real beating
      onBattleEndScoring(state);
      expect(state.scoreLog.filter((e) => e.conditionId === 'eric3')).toHaveLength(expected);
    }
  });
});

describe('v0.4.5 — Kit and Focus', () => {
  it('banks a Focus on Sighting Shot and spends it as a flat bonus on the weak-point roll', () => {
    const state = reworkState();
    const kit = fighterOf(state, KIT);

    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SightingShot' }, createRNG(1));
    expect(kit.focus).toBe(1);
    kit.pending = null;

    // Sharp Shooting's Lv1 target is 5. Seeded so the raw die is below it, then re-run with the
    // Focus paid: same seed, same die, opposite outcome — which is the only way to show the bonus
    // is doing the work rather than the RNG.
    const seedWithLowRoll = 7;
    const withoutFocus = reworkState();
    const kitPlain = fighterOf(withoutFocus, KIT);
    declareSkill(withoutFocus, kitPlain, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting' }, createRNG(seedWithLowRoll));
    const plainRoll = withoutFocus.battle!.log.filter((e) => e.t === 'ROLL').at(-1)!;

    // 5 Focus: Sharp Shooting's Lv1 target is 5, so this covers a d6's worst case outright. That is
    // the point being pinned — enough Focus turns the roll from a gamble into a decision.
    kit.focus = 5;
    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting', focusSpent: 5 }, createRNG(seedWithLowRoll));
    const boostedRoll = state.battle!.log.filter((e) => e.t === 'ROLL').at(-1)!;

    expect(kit.focus).toBe(0);
    // Same seed, same underlying die — the logged value is the total Kit rolled, Focus included.
    expect(boostedRoll).toMatchObject({ die: (plainRoll as { die: number }).die + 5, success: true });
    expect((plainRoll as { success: boolean }).success).toBe(false);
  });

  it('carries Focus on the trap token, because the spring roll happens much later', () => {
    const state = reworkState();
    const kit = fighterOf(state, KIT);
    kit.focus = 2;
    const slot = state.battle!.marker - 1;

    declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Trap', trapSlot: slot, focusSpent: 2 }, createRNG(1));
    expect(kit.focus).toBe(0);
    expect(state.battle!.traps[0]).toMatchObject({ slot, focusBonus: 2 });

    // The boss walks onto it and the trap springs — with the bonus Kit paid for a turn ago.
    state.battle!.marker = slot;
    state.battle!.bossSlot = slot;
    springTrapOnBoss(state, createRNG(3));
    const roll = state.battle!.log.filter((e) => e.t === 'ROLL').at(-1)! as { die: number };
    expect(roll.die).toBeGreaterThanOrEqual(3); // a bare d6 cannot reach this floor from a 1
  });

  it('rejects Focus on a card that cannot spend it, and more Focus than is held', () => {
    const state = reworkState();
    const kit = fighterOf(state, KIT);
    kit.focus = 1;
    expect(() => declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'MultiShot', focusSpent: 1 }, createRNG(1))).toThrow(/cannot spend Focus/);
    expect(() => declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'SharpShooting', focusSpent: 5 }, createRNG(1))).toThrow(/illegal Focus spend/);
    expect(kit.focus).toBe(1); // nothing was consumed by either rejected declare
  });
});

describe('v0.4.5 — Liora', () => {
  it('banks mana off Mana Drain instead of off a non-damaging declare', () => {
    const state = reworkState();
    const liora = fighterOf(state, LIORA);
    const before = state.battle!.bossHp;

    declareSkill(state, liora, { kind: 'DECLARE_ACTION', skillId: 'ManaDrain' }, createRNG(1));
    expect(liora.mana).toBe(1);
    expect(state.battle!.bossHp).toBeLessThan(before); // charging up is no longer a dead turn
    liora.pending = null;

    // Aura Shield explicitly does NOT feed her any more — that is the half of v0.3's ManaCharge
    // passive the rework removes.
    declareSkill(state, liora, { kind: 'DECLARE_ACTION', skillId: 'AuraShield', targetPlayerId: LIORA, manaSpent: 0 }, createRNG(1));
    expect(liora.mana).toBe(1);
  });

  it('shields an ally, not only herself, and pours mana into the shield', () => {
    const state = reworkState();
    const liora = fighterOf(state, LIORA);
    liora.mana = 2;

    declareSkill(state, liora, { kind: 'DECLARE_ACTION', skillId: 'AuraShield', targetPlayerId: ERIC, manaSpent: 2 }, createRNG(1));

    expect(liora.mana).toBe(0);
    expect(liora.shield).toBeNull();
    // Lv1 reduction 4, plus 3 per mana.
    expect(fighterOf(state, ERIC).shield).toMatchObject({ kind: 'mana', reduction: 10 });
  });

  it('lands ❄️ Slow on a 4+ and scores liora1 for it, without gating the damage on the roll', () => {
    // Two seeds: one whose Freeze roll passes and one whose fails. Both must deal full damage.
    const outcomes = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const state = reworkState(seed);
      const liora = fighterOf(state, LIORA);
      const bossSlotBefore = state.battle!.bossSlot;
      const bossHpBefore = state.battle!.bossHp;

      declareSkill(state, liora, { kind: 'DECLARE_ACTION', skillId: 'Freeze', manaSpent: 0 }, createRNG(seed));
      resolveFighterPending(state, liora, createRNG(seed));

      const slowed = state.battle!.log.some((e) => e.t === 'BOSS_SLOWED');
      return {
        slowed,
        dmg: bossHpBefore - state.battle!.bossHp,
        pushed: bossSlotBefore - state.battle!.bossSlot,
        scored: state.scoreLog.filter((e) => e.conditionId === 'liora1').length,
      };
    });

    expect(outcomes.some((o) => o.slowed)).toBe(true);
    expect(outcomes.some((o) => !o.slowed)).toBe(true);
    for (const o of outcomes) {
      expect(o.dmg).toBeGreaterThan(0); // a failed roll is still a full-damage spell
      expect(o.pushed).toBe(o.slowed ? V045_SLOW_BOSS_SLOTS : 0);
      expect(o.scored).toBe(o.slowed ? 1 : 0);
    }
  });

  it('pays liora3 for the Meteor alone, where v0.3 also required her to survive', () => {
    for (const [state, expected] of [
      [reworkState(), 1],
      [stableState(), 0],
    ] as const) {
      state.battle!.outcome = 'boss_defeated';
      const liora = fighterOf(state, LIORA);
      liora.landedMeteorThisBattle = true;
      liora.everDiedThisBattle = true; // delivered the spell, then went down
      onBattleEndScoring(state);
      expect(state.scoreLog.filter((e) => e.conditionId === 'liora3')).toHaveLength(expected);
    }
    expect(skillStats('Meteor', false, 'v0.4').time).toBe(7); // unchanged — only the payout moved
  });
});

describe('v0.4.5 — Luna', () => {
  it('opens the battle with mana, and re-grants it fresh for the next boss rather than carrying it', () => {
    const state = reworkState();
    const luna = fighterOf(state, LUNA);
    expect(luna.mana).toBe(V045_LUNA_START_MANA);

    luna.mana = 40; // banked a fortune this battle
    state.bossIndex = 1;
    prepareBattle(state);
    expect(fighterOf(state, LUNA).mana).toBe(V045_LUNA_START_MANA);

    // And she has no opening mana at all in the stable ruleset.
    expect(fighterOf(stableState(), LUNA).mana).toBe(0);
  });

  it('takes a tithe from single hits only, with no carry between them', () => {
    const state = reworkState();
    const luna = fighterOf(state, LUNA);
    luna.mana = 0;
    const bar = V045_LUNA_MANA_PER_BOSS_DAMAGE;

    // Two swings that each fall one short. Under a cumulative tithe these would combine and pay;
    // under a per-hit one they pay nothing at all, and nothing is remembered.
    applyDamageToBoss(state, ERIC, bar - 1, { ignoresArmor: true, skillId: 'Slash' });
    applyDamageToBoss(state, ERIC, bar - 1, { ignoresArmor: true, skillId: 'Slash' });
    expect(luna.mana).toBe(0);

    // Party damage, not Luna's own: Eric swings, Luna is paid.
    applyDamageToBoss(state, ERIC, bar, { ignoresArmor: true, skillId: 'Slash' });
    expect(luna.mana).toBe(1);

    // One decisive blow pays for every whole multiple inside it — and the change is lost, not banked.
    applyDamageToBoss(state, ERIC, bar * 3 + (bar - 1), { ignoresArmor: true, skillId: 'Meteor' });
    expect(luna.mana).toBe(4);
    applyDamageToBoss(state, ERIC, 1, { ignoresArmor: true, skillId: 'Slash' });
    expect(luna.mana).toBe(4); // the leftover from the big hit did not roll forward
  });

  it('does not tithe in the stable ruleset', () => {
    const state = stableState();
    applyDamageToBoss(state, ERIC, 100, { ignoresArmor: true, skillId: 'Slash' });
    expect(fighterOf(state, LUNA).mana).toBe(0);
  });

  it('charges mana for Heal and refuses the declare without it', () => {
    const state = reworkState();
    const luna = fighterOf(state, LUNA);
    luna.mana = 1;
    expect(() => declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Heal', targetPlayerId: ERIC }, createRNG(1))).toThrow(/needs 2 mana/);

    luna.mana = 2;
    declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Heal', targetPlayerId: ERIC }, createRNG(1));
    expect(luna.mana).toBe(0);
  });

  it('pays luna1 for a heal landing on someone under 30%, and nothing at or above the bar', () => {
    const state = reworkState();
    const eric = fighterOf(state, ERIC);
    const bar = eric.maxHp * V045_LUNA1_HEAL_HP_PCT;

    // Exactly on the bar does not pay — the rule is strictly *under* 30%.
    onHealResolved(state, LUNA, ERIC, 6, Math.ceil(bar));
    expect(state.scoreLog.filter((e) => e.conditionId === 'luna1')).toHaveLength(0);

    onHealResolved(state, LUNA, ERIC, 6, Math.floor(bar) - 1);
    expect(state.scoreLog.filter((e) => e.conditionId === 'luna1')).toHaveLength(1);

    // Per-occurrence: a second qualifying heal pays again.
    onHealResolved(state, LUNA, ERIC, 6, 1);
    expect(state.scoreLog.filter((e) => e.conditionId === 'luna1')).toHaveLength(2);
  });

  it('reads luna1 off the pre-heal HP, so a heal that lifts the target clear still pays', () => {
    const state = reworkState();
    const eric = fighterOf(state, ERIC);
    eric.hp = 2;
    const luna = fighterOf(state, LUNA);
    luna.mana = 10;
    declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Heal', targetPlayerId: ERIC }, createRNG(1));
    resolveFighterPending(state, luna, createRNG(1));
    // The heal has taken him well back over 30% by the time the condition is checked.
    expect(eric.hp).toBeGreaterThan(eric.maxHp * V045_LUNA1_HEAL_HP_PCT);
    expect(state.scoreLog.filter((e) => e.conditionId === 'luna1')).toHaveLength(1);
  });

  it('pays luna1 nothing for a wasted heal, and nothing when someone else does the healing', () => {
    const state = reworkState();
    onHealResolved(state, LUNA, ERIC, 0, 1); // already full — restored nothing
    onHealResolved(state, ERIC, KIT, 6, 1); // not Luna's card
    expect(state.scoreLog.filter((e) => e.conditionId === 'luna1')).toHaveLength(0);
  });

  it('takes luna1 off the ally echo, which still pays every third payout in v0.3', () => {
    for (const [state, expected] of [
      [reworkState(), 0],
      [stableState(), 2],
    ] as const) {
      for (let i = 0; i < 6; i++) {
        pushScore(state, { playerId: [ERIC, KIT, LIORA][i % 3], conditionId: 'eric1', points: 1 });
      }
      expect(state.scoreLog.filter((e) => e.conditionId === 'luna1')).toHaveLength(expected);
    }
  });

  it('drops luna2 to a bar of 14, matching Blessing losing an attack point', () => {
    for (const [state, ruleset, expected] of [
      [reworkState(), 'v0.4', 1],
      [stableState(), 'v0.3', 0],
    ] as const) {
      // 15 damage: over the rework's bar of 14, but not over v0.3's 15.
      state.battle!.partyBuff = { atk: 0, dmgReduction: 0, ownerId: LUNA, expiresAtSlot: 0 };
      onPlayerDealtDamage(state, ERIC, 'Slash', 15, 0);
      expect(state.ruleset).toBe(ruleset);
      expect(state.scoreLog.filter((e) => e.conditionId === 'luna2')).toHaveLength(expected);
    }
  });

  it('slides luna3 down 2 points per death and floors it at 0', () => {
    for (const [deaths, expected] of [
      [0, 6],
      [1, 4],
      [2, 2],
      [3, 0],
      [5, 0],
    ] as const) {
      const state = reworkState();
      state.battle!.outcome = 'boss_defeated';
      state.battle!.deathsThisBattle = deaths;
      onBattleEndScoring(state);
      const entries = state.scoreLog.filter((e) => e.conditionId === 'luna3');
      // A zero payout is not logged at all — an entry worth nothing is noise in the breakdown.
      expect(entries.reduce((sum, e) => sum + e.points, 0)).toBe(expected);
      expect(entries).toHaveLength(expected > 0 ? 1 : 0);
    }
  });

  it('counts a second death by the same fighter, which the v0.3 flag could not', () => {
    const state = reworkState();
    const eric = fighterOf(state, ERIC);
    applyDamageToFighter(state, eric, 999);
    eric.alive = true; // revived
    eric.hp = 5;
    applyDamageToFighter(state, eric, 999);
    expect(state.battle!.deathsThisBattle).toBe(2);

    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.filter((e) => e.conditionId === 'luna3')[0].points).toBe(2);
  });

  it('keeps v0.3 luna3 all-or-nothing', () => {
    const state = stableState();
    state.battle!.outcome = 'boss_defeated';
    fighterOf(state, ERIC).everDiedThisBattle = true;
    onBattleEndScoring(state);
    expect(state.scoreLog.filter((e) => e.conditionId === 'luna3')).toHaveLength(0);
  });

  it('banks 3 mana off Praying and lets Holy Smite through armor', () => {
    const state = reworkState();
    const luna = fighterOf(state, LUNA);
    luna.mana = 0;

    declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Praying' }, createRNG(1));
    expect(luna.mana).toBe(3);
    luna.pending = null;

    // Armor high enough that a non-piercing 2-damage hit would land for nothing at all — which is
    // exactly what v0.3's Hitting did against Aurelius.
    state.battle!.armor = 6;
    const before = state.battle!.bossHp;
    declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'HolySmite' }, createRNG(1));
    expect(before - state.battle!.bossHp).toBe(skillStats('HolySmite', false, 'v0.4').primary);
  });
});

describe('v0.4.5 — the stable ruleset is untouched', () => {
  it('keeps every v0.3 cost, passive and score condition off a v0.3 game', () => {
    const state = stableState();
    const eric = fighterOf(state, ERIC);
    const hpBefore = eric.hp;
    declareSkill(state, eric, { kind: 'DECLARE_ACTION', skillId: 'PowerStrike' }, createRNG(1));
    expect(eric.hp).toBe(hpBefore); // no self-damage rider in v0.3

    const luna = fighterOf(state, LUNA);
    luna.mana = 0;
    // Heal is free here, so a Luna with no mana can still cast it.
    expect(() => declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Heal', targetPlayerId: ERIC }, createRNG(1))).not.toThrow();

    // v0.3's Liora still gets her mana from a non-damaging declare.
    const liora = fighterOf(state, LIORA);
    liora.mana = 0;
    declareSkill(state, liora, { kind: 'DECLARE_ACTION', skillId: 'AuraCharge' }, createRNG(1));
    expect(liora.mana).toBe(1);
  });

  it('still scores liora1 off a big hit in v0.3, and never in the rework', () => {
    const stable = stableState();
    applyDamageToFighter(stable, fighterOf(stable, LIORA), 0); // no-op, keeps the fighter warm
    stable.battle!.armor = 0;
    applyDamageToBoss(stable, LIORA, 20, { ignoresArmor: true, skillId: 'Fireball' });
    // onPlayerDealtDamage is the trigger site, so drive it the way the engine does.
    const rework = reworkState();
    rework.battle!.armor = 0;

    onPlayerDealtDamage(stable, LIORA, 'Fireball', 20, 0);
    onPlayerDealtDamage(rework, LIORA, 'Freeze', 20, 0);

    expect(stable.scoreLog.filter((e) => e.conditionId === 'liora1')).toHaveLength(1);
    expect(rework.scoreLog.filter((e) => e.conditionId === 'liora1')).toHaveLength(0);
  });

  it('keeps Luna warding single-target ailments even though the rework renamed her passive', () => {
    // Looks like a leftover, is not. Ailments only exist under v0.4, which is also the only ruleset
    // running the rework — so re-gating this on "does she have the Holy Water passive" would not
    // scope the ward to v0.3, it would remove it from the game. Pinned so that stays a decision.
    const state = reworkState();
    const luna = fighterOf(state, LUNA);
    expect(applyAilment(state, luna, 'blind', { singleTarget: true })).toBe(false);
    expect(luna.ailments).toHaveLength(0);

    // The carve-out is still only for moves that single her out.
    expect(applyAilment(state, luna, 'blind')).toBe(true);
    expect(luna.ailments.map((a) => a.id)).toContain('blind');

    // And it is hers alone.
    const eric = fighterOf(state, ERIC);
    expect(applyAilment(state, eric, 'blind', { singleTarget: true })).toBe(true);
  });

  it('describes the ward in the passive that actually grants it', () => {
    // The text half of the same decision: Divine Tithe has to say it, because Holy Water is not on
    // her sheet any more for a player to read it off.
    const tithe = charPassive('Luna', 'v0.4')!;
    expect(tithe.id).toBe('DivineTithe');
    expect(tithe.desc.en).toMatch(/singles her out/);
    expect(tithe.desc.th).toMatch(/เล็งเธอคนเดียว/);
  });
});
