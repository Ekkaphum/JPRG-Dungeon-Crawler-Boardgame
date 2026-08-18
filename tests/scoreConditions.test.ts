import { describe, it, expect } from 'vitest';
import {
  prepareBattle,
  onPlayerDealtDamage,
  onWeakPointOpened,
  onTrapTriggered,
  pushScore,
  onHealResolved,
  declareSkill,
  dealDamageToFighterFromBoss,
  createRNG,
} from '@engine/index';
import { scorePoints, ALL_CHAR_IDS, CHARACTERS, LAST_SHOT_POINTS, LUNA1_ALLY_SCORES_PER_POINT, VERA_CHARGED_CAST_MANA } from '@content/characters';
import { fixedDraftState } from './testUtils';

// onPlayerDealtDamage/onWeakPointOpened/onHealResolved had zero test coverage
// before this — every condition here is exercised live only through full-game bot play, which
// doesn't pin exact thresholds or point values. These tests lock in the current numbers (including
// luna1's 2026-08-11 rebalance, see docs/BALANCE_NOTES.md) so a future change has to be deliberate.

function findFighter(state: ReturnType<typeof fixedDraftState>, charId: string) {
  const player = state.players.find((p) => p.charId === charId)!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

describe('scorePoints — single source of truth for condition values', () => {
  it('reads the point value straight off the character definition', () => {
    expect(scorePoints('liora1')).toBe(1);
    expect(scorePoints('liora2')).toBe(1);
    expect(scorePoints('luna1')).toBe(1); // v0.3.15: moved off Heal, see characters.ts
    expect(scorePoints('eric2')).toBe(1); // v0.3.15: halved, see characters.ts
  });

  it('throws on an unknown condition id rather than returning a silent default', () => {
    expect(() => scorePoints('not-a-real-condition')).toThrow();
  });
});

describe('onPlayerDealtDamage — eric1/liora1 damage thresholds', () => {
  it('eric1 fires above 10 damage, not at exactly 10', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');

    onPlayerDealtDamage(state, matt.playerId, 'Slash', 10);
    expect(state.scoreLog.some((e) => e.conditionId === 'eric1')).toBe(false);

    onPlayerDealtDamage(state, matt.playerId, 'Slash', 11);
    const entry = state.scoreLog.find((e) => e.conditionId === 'eric1');
    expect(entry?.points).toBe(1);
  });

  it('liora1 fires at >=14, not at 13', () => {
    // Threshold lowered 15 -> 14 (2026-08-13) so a fully-charged Fireball (max 14 dmg, unchanged)
    // qualifies on its own — see docs/BALANCE_NOTES.md.
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Liora');

    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 13);
    expect(state.scoreLog.some((e) => e.conditionId === 'liora1')).toBe(false);

    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 14);
    expect(state.scoreLog.some((e) => e.conditionId === 'liora1')).toBe(true);
  });

  it('luna2 fires when the target is under Blessing and the hit exceeds 15', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const luna = findFighter(state, 'Luna');
    state.battle!.partyBuff = { atk: 3, dmgReduction: 2, ownerId: luna.playerId, expiresAtSlot: 10 };

    onPlayerDealtDamage(state, kit.playerId, 'QuickShot', 15);
    expect(state.scoreLog.some((e) => e.conditionId === 'luna2')).toBe(false);

    onPlayerDealtDamage(state, kit.playerId, 'QuickShot', 16);
    const entry = state.scoreLog.find((e) => e.conditionId === 'luna2');
    expect(entry?.playerId).toBe(luna.playerId); // credited to Luna, not the attacker
  });

  it('does not fire luna2 without an active party buff', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    onPlayerDealtDamage(state, kit.playerId, 'QuickShot', 20);
    expect(state.scoreLog.some((e) => e.conditionId === 'luna2')).toBe(false);
  });
});

describe('Last Shot — one universal bonus for every character (v0.3.7)', () => {
  // Was a personal condition worth 3 points that only Eric (eric2) and Liora (liora2) owned, so Kit
  // and Luna scored nothing for the identical act. Now a flat LAST_SHOT_POINTS for whoever lands it.
  for (const charId of ['Eric', 'Kit', 'Liora', 'Luna'] as const) {
    it(`awards ${LAST_SHOT_POINTS} points to ${charId} for landing the killing blow`, () => {
      const state = fixedDraftState();
      prepareBattle(state);
      const f = findFighter(state, charId);
      state.battle!.finishedBy = f.playerId;

      onPlayerDealtDamage(state, f.playerId, 'Slash', 9);
      const entries = state.scoreLog.filter((e) => e.conditionId === 'lastShot' && e.playerId === f.playerId);
      expect(entries).toHaveLength(1);
      expect(entries[0].points).toBe(LAST_SHOT_POINTS);
    });
  }

  it('does not fire for whoever did NOT land the killing blow', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');
    const vera = findFighter(state, 'Liora');
    state.battle!.finishedBy = matt.playerId; // Eric finished it, not Liora

    onPlayerDealtDamage(state, vera.playerId, 'Meteor', 20);
    expect(state.scoreLog.some((e) => e.conditionId === 'lastShot')).toBe(false);
  });

  it('is no longer a personal condition on anyone\'s character sheet', () => {
    for (const charId of ALL_CHAR_IDS) {
      expect(CHARACTERS[charId].score.some((c) => c.desc.en.includes('Last Shot'))).toBe(false);
    }
  });
});

describe('liora2 — charged cast (v0.3.7)', () => {
  it('fires at the charge threshold when the spell connects', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Liora');
    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 14, VERA_CHARGED_CAST_MANA);
    expect(state.scoreLog.some((e) => e.conditionId === 'liora2')).toBe(true);
  });

  it('does not fire below the charge threshold', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Liora');
    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 11, VERA_CHARGED_CAST_MANA - 1);
    expect(state.scoreLog.some((e) => e.conditionId === 'liora2')).toBe(false);
  });

  it('does not fire when a charged spell deals no damage', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Liora');
    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 0, VERA_CHARGED_CAST_MANA);
    expect(state.scoreLog.some((e) => e.conditionId === 'liora2')).toBe(false);
  });

  it('a 14+ damage hit latches the flag liora3 reads at end of battle', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Liora');
    expect(vera.landedMeteorThisBattle).toBe(false);
    onPlayerDealtDamage(state, vera.playerId, 'Meteor', 18, 3);
    expect(vera.landedMeteorThisBattle).toBe(true);
  });
});

describe('eric2 — Guard absorbing a hit meant for an ally (v0.3.7)', () => {
  it('scores when Guard redirects a boss hit onto Eric', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');
    const vera = findFighter(state, 'Liora');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));

    dealDamageToFighterFromBoss(state, vera, 10);
    const entries = state.scoreLog.filter((e) => e.conditionId === 'eric2');
    expect(entries).toHaveLength(1);
    expect(entries[0].playerId).toBe(matt.playerId);
  });

  it('scores per hit absorbed, not once per Guard', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');
    const vera = findFighter(state, 'Liora');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));

    dealDamageToFighterFromBoss(state, vera, 5);
    dealDamageToFighterFromBoss(state, vera, 5);
    expect(state.scoreLog.filter((e) => e.conditionId === 'eric2')).toHaveLength(2);
  });

  it('does not score for damage Eric takes on his own account', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');
    const vera = findFighter(state, 'Liora');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));

    dealDamageToFighterFromBoss(state, matt, 10); // his own share of an AoE, not a redirect
    expect(state.scoreLog.some((e) => e.conditionId === 'eric2')).toBe(false);
  });
});

describe('per-occurrence conditions — kit1/kit2/luna1 (v0.3.16)', () => {
  it('kit1 pays 1 point per occurrence when Kit opens a weak point (restored, not just hits into it)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    onWeakPointOpened(state, kit.playerId);
    onWeakPointOpened(state, kit.playerId);
    const entries = state.scoreLog.filter((e) => e.conditionId === 'kit1');
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.points === 1)).toBe(true);
  });

  it('kit1 pays Kit 1 point when ANYONE — an ally or Kit himself — hits inside his open window', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const liora = findFighter(state, 'Liora');
    state.battle!.weakPoint = { ownerId: kit.playerId, expiresAtSlot: 0 };

    onPlayerDealtDamage(state, liora.playerId, 'Fireball', 9);
    let entries = state.scoreLog.filter((e) => e.conditionId === 'kit1');
    expect(entries).toHaveLength(1);
    expect(entries[0].points).toBe(1);
    expect(entries[0].playerId).toBe(kit.playerId); // always credited to the spotter, not the shooter

    // v0.3.16: dropped the allies-only restriction — Kit's own follow-up shot now cashes it in too.
    onPlayerDealtDamage(state, kit.playerId, 'MultiShot', 6);
    entries = state.scoreLog.filter((e) => e.conditionId === 'kit1');
    expect(entries).toHaveLength(2);
  });

  it('kit1 does not fire with no weak point up, nor for a window somebody else opened', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    const liora = findFighter(state, 'Liora');
    onPlayerDealtDamage(state, liora.playerId, 'Fireball', 9);
    expect(state.scoreLog.some((e) => e.conditionId === 'kit1')).toBe(false);

    state.battle!.weakPoint = { ownerId: liora.playerId, expiresAtSlot: 0 };
    onPlayerDealtDamage(state, kit.playerId, 'MultiShot', 6);
    expect(state.scoreLog.some((e) => e.conditionId === 'kit1')).toBe(false);
  });

  it('kit2 (v0.3.16, restored, 1 -> 2 after the Kit shortfall) pays Kit 2 when Trap triggers', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    onTrapTriggered(state, kit.playerId);
    const entries = state.scoreLog.filter((e) => e.conditionId === 'kit2');
    expect(entries).toHaveLength(1);
    expect(entries[0].points).toBe(2);
    expect(entries[0].playerId).toBe(kit.playerId);
  });

  it('luna1 (v0.3.15) pays Luna 1 for every LUNA1_ALLY_SCORES_PER_POINT scoring plays by others', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    const kit = findFighter(state, 'Kit');
    const n = LUNA1_ALLY_SCORES_PER_POINT;
    // kit2 (Trap triggering) is a plain, unconditional scoring event — the simplest way to generate
    // "someone else scored" n times without any extra state setup.
    for (let i = 0; i < n - 1; i++) onTrapTriggered(state, kit.playerId); // not yet
    expect(state.scoreLog.some((e) => e.conditionId === 'luna1')).toBe(false);

    onTrapTriggered(state, kit.playerId); // the one that completes the set cashes in
    const entries = state.scoreLog.filter((e) => e.conditionId === 'luna1');
    expect(entries).toHaveLength(1);
    expect(entries[0].points).toBe(1);
    expect(entries[0].playerId).toBe(luna.playerId);

    for (let i = 0; i < n; i++) onTrapTriggered(state, kit.playerId);
    expect(state.scoreLog.filter((e) => e.conditionId === 'luna1')).toHaveLength(2);
  });

  it('luna1 does not echo itself, nor the payouts the rules hand out rather than players earning', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const eric = findFighter(state, 'Eric');
    pushScore(state, { playerId: eric.playerId, conditionId: 'lastShot', points: 2 });
    pushScore(state, { playerId: eric.playerId, conditionId: 'timeBonus', points: 4 });
    expect(state.scoreLog.some((e) => e.conditionId === 'luna1')).toBe(false);
  });

  it('luna1 no longer rides Heal — healing is still her job, just not what her card pays for', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    const matt = findFighter(state, 'Eric');
    onHealResolved(state, luna.playerId, matt.playerId, 1);
    expect(state.scoreLog.some((e) => e.conditionId === 'luna1')).toBe(false);
  });

  it('luna1 does not fire when the heal restored 0 HP (already full)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    const matt = findFighter(state, 'Eric');
    onHealResolved(state, luna.playerId, matt.playerId, 0);
    expect(state.scoreLog.some((e) => e.conditionId === 'luna1')).toBe(false);
  });

  it('luna1 does not fire when Luna heals herself, even when HP is restored', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    onHealResolved(state, luna.playerId, luna.playerId, 6);
    expect(state.scoreLog.some((e) => e.conditionId === 'luna1')).toBe(false);
  });
});
