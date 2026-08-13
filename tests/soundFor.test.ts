import { describe, it, expect } from 'vitest';
import { soundFor } from '@session/playback';
import type { ClockLogEvent } from '@engine/index';

// soundFor is the pure event->sound mapping the audio hook dispatches through (@ui/audio); kept
// separate from the actual AudioContext calls specifically so it's testable without a browser.
// Mirrors popupFor/actionFlashFor's existing wasted/zero-amount guards — a sound firing for a
// no-op event would be a bug players actually notice.

describe('soundFor', () => {
  it('hitBoss for a landed player attack on the boss', () => {
    const ev: ClockLogEvent = { t: 'RESOLVE_ATTACK', playerId: 0, skillId: 'Slash', targetId: 'boss', dmg: 6, wasted: false };
    expect(soundFor(ev)).toBe('hitBoss');
  });

  it('hitPlayer for a landed boss attack on a player', () => {
    const ev: ClockLogEvent = { t: 'RESOLVE_ATTACK', playerId: 'boss', skillId: 'BossMove', targetId: 2, dmg: 6, wasted: false };
    expect(soundFor(ev)).toBe('hitPlayer');
  });

  it('nothing for a wasted or zero-damage attack', () => {
    const wasted: ClockLogEvent = { t: 'RESOLVE_ATTACK', playerId: 0, skillId: 'Slash', targetId: 'boss', dmg: 0, wasted: true };
    const zero: ClockLogEvent = { t: 'RESOLVE_ATTACK', playerId: 0, skillId: 'Slash', targetId: 'boss', dmg: 0, wasted: false };
    expect(soundFor(wasted)).toBeNull();
    expect(soundFor(zero)).toBeNull();
  });

  it('hitBoss for a triggered trap, nothing for one that dealt no damage', () => {
    expect(soundFor({ t: 'RESOLVE_TRAP_TRIGGER', slot: 5, dmg: 4, ownerId: 1 })).toBe('hitBoss');
    expect(soundFor({ t: 'RESOLVE_TRAP_TRIGGER', slot: 5, dmg: 0, ownerId: 1 })).toBeNull();
  });

  it('heal only for a landed, non-zero heal', () => {
    expect(soundFor({ t: 'RESOLVE_HEAL', playerId: 3, targetId: 0, amount: 6, wasted: false })).toBe('heal');
    expect(soundFor({ t: 'RESOLVE_HEAL', playerId: 3, targetId: 0, amount: 0, wasted: false })).toBeNull();
    expect(soundFor({ t: 'RESOLVE_HEAL', playerId: 3, targetId: -1, amount: 0, wasted: true })).toBeNull();
  });

  it('death and revive', () => {
    expect(soundFor({ t: 'DEATH', playerId: 1, atSlot: 10, reviveAtSlot: 4 })).toBe('death');
    expect(soundFor({ t: 'REVIVE', playerId: 1, atSlot: 4, hp: 6 })).toBe('revive');
  });

  it('weakPoint only for a successful weak-point roll, not other rolls or a miss', () => {
    expect(soundFor({ t: 'ROLL', playerId: 1, purpose: 'QuickShot weak point', die: 5, target: 5, success: true })).toBe('weakPoint');
    expect(soundFor({ t: 'ROLL', playerId: 1, purpose: 'QuickShot weak point', die: 2, target: 5, success: false })).toBeNull();
    expect(soundFor({ t: 'ROLL', playerId: 1, purpose: 'Trap cancel', die: 6, target: 5, success: true })).toBeNull();
    expect(soundFor({ t: 'ROLL', playerId: 'boss', purpose: 'boss move', die: 3, target: null, success: null })).toBeNull();
  });

  it('bossMove and score', () => {
    expect(soundFor({ t: 'BOSS_MOVE', bossId: 'Ragorath', moveKey: 'A' })).toBe('bossMove');
    expect(soundFor({ t: 'SCORE', entry: { playerId: 0, conditionId: 'matt1', points: 1, atSlot: 10, bossId: 'Ragorath' } })).toBe('score');
  });

  it('victory for a boss-defeated end, defeat for a clock-ran-out end', () => {
    expect(soundFor({ t: 'BATTLE_END', outcome: 'boss_defeated', finishedBy: 2, expGranted: 0 })).toBe('victory');
    expect(soundFor({ t: 'BATTLE_END', outcome: 'clock_ran_out', finishedBy: null, expGranted: 0 })).toBe('defeat');
  });

  it('nothing for a marker tick or declare — those are handled elsewhere', () => {
    expect(soundFor({ t: 'MARKER_TICK', marker: 12 })).toBeNull();
    expect(soundFor({ t: 'DECLARE', playerId: 0, slot: 20, skillId: 'Slash', landSlot: 16, label: 'Slash' })).toBeNull();
  });
});
