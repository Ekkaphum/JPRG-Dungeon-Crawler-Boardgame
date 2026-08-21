import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_CHAR_IDS, CHARACTERS } from '@content/characters';
import { ACTION_EFFECT_SPRITES, actionEffectSpriteUrl } from '@ui/common/ActionEffect';

describe('action effect sprite strips', () => {
  const everySkill = ALL_CHAR_IDS.flatMap((charId) => CHARACTERS[charId].skills);

  it('assigns one unique effect sheet to every playable action', () => {
    expect(Object.keys(ACTION_EFFECT_SPRITES).sort()).toEqual([...everySkill].sort());
    expect(new Set(Object.values(ACTION_EFFECT_SPRITES)).size).toBe(everySkill.length);
    for (const skillId of everySkill) {
      expect(actionEffectSpriteUrl(skillId)).toBe(`/assets/effects/${skillId}.png`);
    }
  });

  it('ships each effect as a transparent-ready 4x1 PNG strip', () => {
    for (const skillId of everySkill) {
      const file = readFileSync(join(process.cwd(), 'public', actionEffectSpriteUrl(skillId)));
      expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(file.readUInt32BE(16)).toBe(1024);
      expect(file.readUInt32BE(20)).toBe(256);
      expect(file[25]).toBe(6); // RGBA colour type
    }
  });
});
