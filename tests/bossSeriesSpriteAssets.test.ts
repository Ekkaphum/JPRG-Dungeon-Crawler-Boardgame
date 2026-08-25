import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readWebp } from './imageMeta';

const NEW_BOSS_APPEARANCES = [
  'Levithar',
  'Gulvorax',
  'Mammorax',
  'Asmodeus',
  'AureliusUncrowned',
  'PawnRank',
  'Knight',
  'Rook',
  'Bishop',
  'Queen',
  'King',
] as const;

describe('Seven Sins and Chess boss sprite assets', () => {
  it('packs every idle/action sheet into the existing 4x3 boss contract', () => {
    for (const bossId of NEW_BOSS_APPEARANCES) {
      const file = readFileSync(join(process.cwd(), 'public', 'assets', 'sprites', 'bosses', `${bossId}.webp`));
      const meta = readWebp(file);
      expect(meta.width, bossId).toBe(1402);
      expect(meta.height, bossId).toBe(1122);
      expect(meta.hasAlpha, bossId).toBe(true);
    }
  });

  it('packs every recoil animation into the existing 4x1 hit contract', () => {
    for (const bossId of NEW_BOSS_APPEARANCES) {
      const file = readFileSync(join(process.cwd(), 'public', 'assets', 'sprites', 'hit', `${bossId}.webp`));
      const meta = readWebp(file);
      expect(meta.width, bossId).toBe(2048);
      expect(meta.height, bossId).toBe(512);
      expect(meta.hasAlpha, bossId).toBe(true);
    }
  });
});
