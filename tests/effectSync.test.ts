import { describe, it, expect } from 'vitest';
import { eventDelay, effectDurationFor, EFFECT_TAIL_MS, MIN_EFFECT_MS } from '@session/playback';
import { ANIM_DELAY_OPTIONS } from '@session/persistence';
import type { ClockLogEvent } from '@engine/index';

// Reported as "the on-screen effect and the log don't line up — sometimes the log is ahead,
// sometimes behind". The cause was structural rather than flaky: effects had two fixed lifetimes
// (FLASH_MS 1400, POPUP_MS 1100) while the gap between log lines was eventDelay(ev, animSpeedMs),
// which varies by event type *and* by the player's speed setting. The two agreed at no setting.
//
// These tests assert the invariant that replaced them: an effect lives at least as long as the
// pause before the next log line, and never so long that it spills past that line by more than the
// deliberate smoothing tail.

const SAMPLE: ClockLogEvent[] = [
  { t: 'MARKER_TICK', marker: 12 },
  { t: 'BOSS_MOVE', bossId: 'Ragorath', moveKey: 'A' },
  { t: 'RESOLVE_ATTACK', playerId: 0, skillId: 'Slash', targetId: 'boss', dmg: 7, wasted: false },
  { t: 'RESOLVE_HEAL', playerId: 3, targetId: 0, amount: 6, wasted: false },
  { t: 'ROLL', playerId: 1, purpose: 'test', die: 5, target: 5, success: true },
  { t: 'RESOLVE_BUFF', playerId: 2, skillId: 'Blessing' },
  { t: 'REVIVE', playerId: 1, atSlot: 8, hp: 7 },
  { t: 'SCORE', entry: { playerId: 0, conditionId: 'eric1', points: 1, atSlot: 10, bossId: 'Ragorath' } },
];

describe('on-screen effects stay in lockstep with the battle log', () => {
  it('an effect never disappears before its own log line stops being the newest', () => {
    for (const base of ANIM_DELAY_OPTIONS) {
      for (const ev of SAMPLE) {
        const gap = eventDelay(ev, base);
        const life = effectDurationFor(ev, base);
        // The drain loop sleeps `gap` before revealing the next event. If the effect died first the
        // board would sit blank while the log still showed this line — the "log runs ahead" half of
        // the report.
        expect(life, `${ev.t} @${base}ms leaves a blank gap`).toBeGreaterThanOrEqual(gap);
      }
    }
  });

  it('an effect never outlives its log line by more than the smoothing tail', () => {
    for (const base of ANIM_DELAY_OPTIONS) {
      for (const ev of SAMPLE) {
        const gap = eventDelay(ev, base);
        const life = effectDurationFor(ev, base);
        // Overshooting is the "log runs behind" half: at 500ms/event the old fixed 1400ms flash
        // stayed up across roughly three further log lines.
        const allowed = Math.max(MIN_EFFECT_MS, gap + EFFECT_TAIL_MS);
        expect(life, `${ev.t} @${base}ms lingers past its line`).toBeLessThanOrEqual(allowed);
      }
    }
  });

  it('scales with the speed setting instead of being fixed — the actual bug', () => {
    const attack = SAMPLE[2];
    const slow = effectDurationFor(attack, 2000);
    const fast = effectDurationFor(attack, 500);
    expect(slow).toBeGreaterThan(fast);
    // The old constants did the opposite: identical at every speed, so they could only ever match
    // one of them by luck.
    expect(slow).toBe(2000 + EFFECT_TAIL_MS);
    expect(fast).toBe(500 + EFFECT_TAIL_MS);
  });

  it('marker ticks get a short effect, matching their short pause', () => {
    const tick = SAMPLE[0];
    const attack = SAMPLE[2];
    expect(effectDurationFor(tick, 1000)).toBeLessThan(effectDurationFor(attack, 1000));
  });

  it('instant mode still draws something rather than a zero-length flash', () => {
    for (const ev of SAMPLE) {
      expect(effectDurationFor(ev, 0)).toBe(MIN_EFFECT_MS);
    }
  });
});
