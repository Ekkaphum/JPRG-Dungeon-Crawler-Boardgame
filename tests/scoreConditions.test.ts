import { describe, it, expect } from 'vitest';
import {
  prepareBattle,
  onPlayerDealtDamage,
  onWeakPointOpened,
  onTrapTriggered,
  onHealResolved,
  declareSkill,
  dealDamageToFighterFromBoss,
  createRNG,
} from '@engine/index';
import { scorePoints, ALL_CHAR_IDS, CHARACTERS, LAST_SHOT_POINTS, VERA_CHARGED_CAST_MANA } from '@content/characters';
import { fixedDraftState } from './testUtils';

// onPlayerDealtDamage/onWeakPointOpened/onTrapTriggered/onHealResolved had zero test coverage
// before this — every condition here is exercised live only through full-game bot play, which
// doesn't pin exact thresholds or point values. These tests lock in the current numbers (including
// luna1's 2026-08-11 rebalance, see docs/BALANCE_NOTES.md) so a future change has to be deliberate.

function findFighter(state: ReturnType<typeof fixedDraftState>, charId: string) {
  const player = state.players.find((p) => p.charId === charId)!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

describe('scorePoints — single source of truth for condition values', () => {
  it('reads the point value straight off the character definition', () => {
    expect(scorePoints('vera1')).toBe(1);
    expect(scorePoints('vera2')).toBe(1);
    expect(scorePoints('luna1')).toBe(3);
    expect(scorePoints('matt2')).toBe(2);
  });

  it('throws on an unknown condition id rather than returning a silent default', () => {
    expect(() => scorePoints('not-a-real-condition')).toThrow();
  });
});

describe('onPlayerDealtDamage — matt1/vera1 damage thresholds', () => {
  it('matt1 fires above 10 damage, not at exactly 10', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');

    onPlayerDealtDamage(state, matt.playerId, 'Slash', 10);
    expect(state.scoreLog.some((e) => e.conditionId === 'matt1')).toBe(false);

    onPlayerDealtDamage(state, matt.playerId, 'Slash', 11);
    const entry = state.scoreLog.find((e) => e.conditionId === 'matt1');
    expect(entry?.points).toBe(1);
  });

  it('vera1 fires at >=14, not at 13', () => {
    // Threshold lowered 15 -> 14 (2026-08-13) so a fully-charged Fireball (max 14 dmg, unchanged)
    // qualifies on its own — see docs/BALANCE_NOTES.md.
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');

    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 13);
    expect(state.scoreLog.some((e) => e.conditionId === 'vera1')).toBe(false);

    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 14);
    expect(state.scoreLog.some((e) => e.conditionId === 'vera1')).toBe(true);
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
  // Was a personal condition worth 3 points that only Matt (matt2) and Vera (vera2) owned, so Kit
  // and Luna scored nothing for the identical act. Now a flat LAST_SHOT_POINTS for whoever lands it.
  for (const charId of ['Matt', 'Kit', 'Vera', 'Luna'] as const) {
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
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    state.battle!.finishedBy = matt.playerId; // Matt finished it, not Vera

    onPlayerDealtDamage(state, vera.playerId, 'Meteor', 20);
    expect(state.scoreLog.some((e) => e.conditionId === 'lastShot')).toBe(false);
  });

  it('is no longer a personal condition on anyone\'s character sheet', () => {
    for (const charId of ALL_CHAR_IDS) {
      expect(CHARACTERS[charId].score.some((c) => c.desc.en.includes('Last Shot'))).toBe(false);
    }
  });
});

describe('vera2 — charged cast (v0.3.7)', () => {
  it('fires at the charge threshold when the spell connects', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 14, VERA_CHARGED_CAST_MANA);
    expect(state.scoreLog.some((e) => e.conditionId === 'vera2')).toBe(true);
  });

  it('does not fire below the charge threshold', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 11, VERA_CHARGED_CAST_MANA - 1);
    expect(state.scoreLog.some((e) => e.conditionId === 'vera2')).toBe(false);
  });

  it('does not fire when a charged spell deals no damage', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 0, VERA_CHARGED_CAST_MANA);
    expect(state.scoreLog.some((e) => e.conditionId === 'vera2')).toBe(false);
  });

  it('a 14+ damage hit latches the flag vera3 reads at end of battle', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    expect(vera.landedMeteorThisBattle).toBe(false);
    onPlayerDealtDamage(state, vera.playerId, 'Meteor', 18, 3);
    expect(vera.landedMeteorThisBattle).toBe(true);
  });
});

describe('matt2 — Guard absorbing a hit meant for an ally (v0.3.7)', () => {
  it('scores when Guard redirects a boss hit onto Matt', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));

    dealDamageToFighterFromBoss(state, vera, 10);
    const entries = state.scoreLog.filter((e) => e.conditionId === 'matt2');
    expect(entries).toHaveLength(1);
    expect(entries[0].playerId).toBe(matt.playerId);
  });

  it('scores per hit absorbed, not once per Guard', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));

    dealDamageToFighterFromBoss(state, vera, 5);
    dealDamageToFighterFromBoss(state, vera, 5);
    expect(state.scoreLog.filter((e) => e.conditionId === 'matt2')).toHaveLength(2);
  });

  it('does not score for damage Matt takes on his own account', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: vera.playerId }, createRNG(1));

    dealDamageToFighterFromBoss(state, matt, 10); // his own share of an AoE, not a redirect
    expect(state.scoreLog.some((e) => e.conditionId === 'matt2')).toBe(false);
  });
});

describe('per-occurrence conditions — kit1/kit2/luna1', () => {
  it('kit1 (weak point opened) awards 1 point per occurrence', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    onWeakPointOpened(state, kit.playerId);
    onWeakPointOpened(state, kit.playerId);
    const entries = state.scoreLog.filter((e) => e.conditionId === 'kit1');
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.points === 1)).toBe(true);
  });

  it('kit2 (trap triggered) awards 2 points per occurrence (raised from 1 in v0.3.8)', () => {
    // The trap's frequency is effectively fixed by Kit's Skill Improvement passive rather than by
    // anything tunable on the condition, so point value is the only lever left — see the note on
    // kit2 in @content/characters.
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    onTrapTriggered(state, kit.playerId);
    expect(state.scoreLog.find((e) => e.conditionId === 'kit2')?.points).toBe(2);
  });

  it('luna1 (Heal restoring >=1 HP) awards the rebalanced 3 points, not the old 1', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    const matt = findFighter(state, 'Matt');
    onHealResolved(state, luna.playerId, matt.playerId, 1);
    expect(state.scoreLog.find((e) => e.conditionId === 'luna1')?.points).toBe(3);
  });

  it('luna1 does not fire when the heal restored 0 HP (already full)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    const matt = findFighter(state, 'Matt');
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
