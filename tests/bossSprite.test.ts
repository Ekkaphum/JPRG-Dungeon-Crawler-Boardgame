import { describe, expect, it } from 'vitest';
import { bossActionRow } from '../src/ui/clock/bossSpriteRows';

describe('boss sprite animation rows', () => {
  it('uses row 0 while idle', () => {
    expect(bossActionRow('Ragorath', null)).toBe(0);
    expect(bossActionRow('Somnivar', null)).toBe(0);
    expect(bossActionRow('Aurelius', null)).toBe(0);
  });

  it('maps physical moves to attack and supernatural moves to cast', () => {
    expect(bossActionRow('Ragorath', 'A')).toBe(1);
    expect(bossActionRow('Ragorath', 'C')).toBe(2);
    expect(bossActionRow('Somnivar', 'B')).toBe(1);
    expect(bossActionRow('Somnivar', 'C')).toBe(2);
    expect(bossActionRow('Aurelius', 'A')).toBe(1);
    expect(bossActionRow('Aurelius', 'B')).toBe(2);
    expect(bossActionRow('Aurelius', 'C')).toBe(2);
  });
});
