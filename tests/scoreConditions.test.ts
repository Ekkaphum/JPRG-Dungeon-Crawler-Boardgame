import { describe, it, expect } from 'vitest';
import { prepareBattle, onPlayerDealtDamage, onWeakPointOpened, onTrapTriggered, onHealResolved } from '@engine/index';
import { scorePoints } from '@content/characters';
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
    expect(scorePoints('vera2')).toBe(3);
    expect(scorePoints('luna1')).toBe(3);
    expect(scorePoints('matt2')).toBe(3);
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
    state.battle!.partyBuff = { atk: 3, dmgReduction: 2, ownerId: luna.playerId };

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

describe('onPlayerDealtDamage — Last Shot bonuses (matt2/vera2)', () => {
  it('matt2 fires for Matt landing the Last Shot with any skill', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    state.battle!.finishedBy = matt.playerId;

    onPlayerDealtDamage(state, matt.playerId, 'Slash', 9);
    const entry = state.scoreLog.find((e) => e.conditionId === 'matt2');
    expect(entry?.points).toBe(3);
  });

  it('vera2 fires for a Meteor Last Shot', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    state.battle!.finishedBy = vera.playerId;

    onPlayerDealtDamage(state, vera.playerId, 'Meteor', 20);
    const entry = state.scoreLog.find((e) => e.conditionId === 'vera2');
    expect(entry?.points).toBe(3);
  });

  it('vera2 fires for a Fireball Last Shot too — broadened from Meteor-only (2026-08-13)', () => {
    // Broadened to any skill and points cut 4 -> 3 to compensate, as part of the larger
    // equal-start/HP/⏱ rebalance pass — see docs/BALANCE_NOTES.md. The identical broadening was
    // tried and reverted standalone on 2026-08-11 for overshooting Vera's total; re-verify against
    // the other three characters' totals after any further change to this condition.
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Vera');
    state.battle!.finishedBy = vera.playerId;

    onPlayerDealtDamage(state, vera.playerId, 'Fireball', 20);
    const entry = state.scoreLog.find((e) => e.conditionId === 'vera2');
    expect(entry?.points).toBe(3);
  });

  it('neither Last Shot bonus fires for whoever did NOT land the killing blow', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Matt');
    const vera = findFighter(state, 'Vera');
    state.battle!.finishedBy = matt.playerId; // Matt finished it, not Vera

    onPlayerDealtDamage(state, vera.playerId, 'Meteor', 20);
    expect(state.scoreLog.some((e) => e.conditionId === 'vera2')).toBe(false);
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

  it('kit2 (trap triggered) awards 1 point per occurrence', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    onTrapTriggered(state, kit.playerId);
    expect(state.scoreLog.find((e) => e.conditionId === 'kit2')?.points).toBe(1);
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
