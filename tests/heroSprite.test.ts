import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASTING_SKILLS, hasSpriteSheet, heroHitSpriteUrl, isCastingSkill, spriteActionRow } from '@ui/clock/HeroSprite';
import { readWebp } from './imageMeta';

describe('hero sprite animation rows', () => {
  it('ships sprite sheets for the full v0.4 roster', () => {
    for (const charId of ['Eric', 'Kit', 'Liora', 'Luna', 'Chrono', 'Kage', 'Morvane'] as const) {
      expect(hasSpriteSheet(charId)).toBe(true);
      expect(spriteActionRow(charId, null)).toBe(0);
    }
  });

  it('packs every hero sheet into exact square 4x5 cells', () => {
    for (const charId of ['Eric', 'Kit', 'Liora', 'Luna', 'Chrono', 'Kage', 'Morvane'] as const) {
      const file = readFileSync(join(process.cwd(), 'public', 'assets', 'sprites', `${charId}.webp`));
      const { width, height } = readWebp(file);
      expect(width % 4, charId).toBe(0);
      expect(height % 5, charId).toBe(0);
      expect(width / 4, charId).toBe(height / 5);
    }
  });

  it('keeps every hit row on the same 4x1 grid', () => {
    for (const charId of ['Eric', 'Kit', 'Liora', 'Luna', 'Chrono', 'Kage', 'Morvane'] as const) {
      const file = readFileSync(join(process.cwd(), 'public', heroHitSpriteUrl(charId)));
      const { width, height } = readWebp(file);
      expect(width % 4, charId).toBe(0);
      expect(width / 4, charId).toBe(height);
    }
  });

  // Same reasoning as the effect strips: these sheets carry the game's character art and v0.4.0
  // had to hand-repaint an extraction fringe out of three of them, so they ship near-lossless
  // (VP8L) rather than at the q90 that a routine "convert to WebP" would produce.
  it('keeps every hero sheet in the lossless container', () => {
    for (const charId of ['Eric', 'Kit', 'Liora', 'Luna', 'Chrono', 'Kage', 'Morvane'] as const) {
      for (const path of [join('assets', 'sprites', `${charId}.webp`), heroHitSpriteUrl(charId).slice(1)]) {
        const file = readFileSync(join(process.cwd(), 'public', path));
        expect(readWebp(file).format, path).toBe('VP8L');
      }
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

  it('serves every hit row as WebP', () => {
    expect(heroHitSpriteUrl('Kit')).toBe('/assets/sprites/hit/Kit.webp');
    expect(heroHitSpriteUrl('Chrono')).toBe('/assets/sprites/hit/Chrono.webp');
    expect(heroHitSpriteUrl('Kage')).toBe('/assets/sprites/hit/Kage.webp');
    expect(heroHitSpriteUrl('Morvane')).toBe('/assets/sprites/hit/Morvane.webp');
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
