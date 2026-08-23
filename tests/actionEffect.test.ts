import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_CHAR_IDS, charSkills } from '@content/characters';
import { ACTION_EFFECT_SPRITES, actionEffectSpriteUrl } from '@ui/common/ActionEffect';
import { readWebp } from './imageMeta';

describe('action effect sprite strips', () => {
  // Both rulesets' kits: v0.4.5 gives three of the four core characters different cards, and every
  // card a player can actually be dealt needs its own strip regardless of which ruleset dealt it.
  const everySkill = [
    ...new Set(ALL_CHAR_IDS.flatMap((charId) => [...charSkills(charId, 'v0.3'), ...charSkills(charId, 'v0.4')])),
  ];

  it('assigns one unique effect sheet to every playable action', () => {
    expect(Object.keys(ACTION_EFFECT_SPRITES).sort()).toEqual([...everySkill].sort());
    expect(new Set(Object.values(ACTION_EFFECT_SPRITES)).size).toBe(everySkill.length);
    for (const skillId of everySkill) {
      expect(actionEffectSpriteUrl(skillId)).toBe(`/assets/effects/${skillId}.webp`);
    }
  });

  it('ships each effect as a transparent-ready 4x1 WebP strip', () => {
    for (const skillId of everySkill) {
      const file = readFileSync(join(process.cwd(), 'public', actionEffectSpriteUrl(skillId)));
      const meta = readWebp(file);
      expect(meta.width, skillId).toBe(1024);
      expect(meta.height, skillId).toBe(256);
      expect(meta.hasAlpha, skillId).toBe(true);
    }
  });

  // Effect strips are bright glows with hard edges over transparency, drawn at roughly 1:1 on the
  // battle stage. Ordinary lossy WebP mangles exactly that: a q90 pass measured 27 dB composited
  // PSNR with single pixels off by 217/255, and pushing quality to 98 bought 0.2 dB for 10% more
  // bytes because the error is structural, not a quantiser step. They ship near-lossless (VP8L
  // container, measured worst-pixel deviation 4/255). A re-encode that drops to plain lossy would
  // pass every other assertion here, so this is the one that catches it.
  it('keeps every effect strip in the lossless container', () => {
    for (const skillId of everySkill) {
      const file = readFileSync(join(process.cwd(), 'public', actionEffectSpriteUrl(skillId)));
      expect(readWebp(file).format, skillId).toBe('VP8L');
    }
  });
});
