import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASTING_SKILLS, hasSpriteSheet, heroHitSpriteUrl, isCastingSkill, spriteActionRow } from '@ui/clock/HeroSprite';

describe('hero sprite animation rows', () => {
  it('ships sprite sheets for the full v0.4 roster', () => {
    for (const charId of ['Eric', 'Kit', 'Liora', 'Luna', 'Chrono', 'Kage', 'Morvane'] as const) {
      expect(hasSpriteSheet(charId)).toBe(true);
      expect(spriteActionRow(charId, null)).toBe(0);
    }
  });

  it('packs every hero sheet into exact square 4x5 cells', () => {
    for (const charId of ['Eric', 'Kit', 'Liora', 'Luna', 'Chrono', 'Kage', 'Morvane'] as const) {
      const file = readFileSync(join(process.cwd(), 'public', 'assets', 'sprites', `${charId}.png`));
      expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const width = file.readUInt32BE(16);
      const height = file.readUInt32BE(20);
      expect(width % 4).toBe(0);
      expect(height % 5).toBe(0);
      expect(width / 4).toBe(height / 5);
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

  it('uses clean PNG hit rows for Kit and the generated heroes', () => {
    expect(heroHitSpriteUrl('Kit')).toBe('/assets/sprites/hit/Kit.png');
    expect(heroHitSpriteUrl('Chrono')).toBe('/assets/sprites/hit/Chrono.png');
    expect(heroHitSpriteUrl('Kage')).toBe('/assets/sprites/hit/Kage.png');
    expect(heroHitSpriteUrl('Morvane')).toBe('/assets/sprites/hit/Morvane.png');
    expect(heroHitSpriteUrl('Eric')).toBe('/assets/sprites/hit/Eric.webp');
  });

  it('loops casting art only for the eight requested delayed skills', () => {
    expect([...CASTING_SKILLS]).toEqual([
      'Guard',
      'CounterAttack',
      'Trap',
      'Fireball',
      'Meteor',
      'Heal',
      'Blessing',
      'AuraCharge',
    ]);
    expect(isCastingSkill('Fireball')).toBe(true);
    expect(isCastingSkill('SharpShooting')).toBe(false);
    expect(isCastingSkill(null)).toBe(false);
  });
});
