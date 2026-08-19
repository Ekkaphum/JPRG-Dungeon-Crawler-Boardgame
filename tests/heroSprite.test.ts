import { describe, expect, it } from 'vitest';
import { hasSpriteSheet, spriteActionRow } from '@ui/clock/HeroSprite';

describe('hero sprite animation rows', () => {
  it('ships sprite sheets for the full v0.4 roster', () => {
    for (const charId of ['Eric', 'Kit', 'Liora', 'Luna', 'Chrono', 'Kage', 'Morvane'] as const) {
      expect(hasSpriteSheet(charId)).toBe(true);
      expect(spriteActionRow(charId, null)).toBe(0);
    }
  });

  it('maps every new character skill to its authored action row', () => {
    expect(spriteActionRow('Chrono', 'Tick')).toBe(1);
    expect(spriteActionRow('Chrono', 'HourglassShard')).toBe(2);
    expect(spriteActionRow('Chrono', 'Haste')).toBe(3);
    expect(spriteActionRow('Chrono', 'Rewind')).toBe(4);

    expect(spriteActionRow('Kage', 'Shuriken')).toBe(1);
    expect(spriteActionRow('Kage', 'TwinFang')).toBe(2);
    expect(spriteActionRow('Kage', 'SmokeBomb')).toBe(3);
    expect(spriteActionRow('Kage', 'Assassinate')).toBe(4);

    expect(spriteActionRow('Morvane', 'Drain')).toBe(1);
    expect(spriteActionRow('Morvane', 'SoulSiphon')).toBe(2);
    expect(spriteActionRow('Morvane', 'RaiseDead')).toBe(3);
    expect(spriteActionRow('Morvane', 'DeathCoil')).toBe(4);
  });
});
