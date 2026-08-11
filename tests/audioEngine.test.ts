import { describe, it, expect } from 'vitest';
import { tickUrgency } from '@ui/audio/AudioEngine';

describe('tickUrgency', () => {
  it('is 0 well above the last-stretch window', () => {
    expect(tickUrgency(24)).toBe(0);
    expect(tickUrgency(20)).toBe(0);
  });

  it('is flat at 0 right up to slot 12', () => {
    expect(tickUrgency(12)).toBe(0);
  });

  it('ramps linearly from 0 to 1 across the last 12 slots', () => {
    expect(tickUrgency(6)).toBeCloseTo(0.5, 5);
    expect(tickUrgency(3)).toBeCloseTo(0.75, 5);
  });

  it('reaches exactly 1 at slot 0 and never exceeds it below 0', () => {
    expect(tickUrgency(0)).toBe(1);
    expect(tickUrgency(-1)).toBe(1);
  });
});
