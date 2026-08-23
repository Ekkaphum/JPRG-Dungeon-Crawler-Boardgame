import type { CharId, SkillId } from '@engine/index';
import type { CSSProperties } from 'react';

const ACTION_ROW: Record<CharId, Partial<Record<SkillId, number>>> = {
  Eric: { Slash: 1, PowerStrike: 2, Guard: 3, CounterAttack: 4 },
  Kit: { QuickShot: 1, SharpShooting: 2, Trap: 3, MultiShot: 4 },
  Liora: { AirPush: 1, Fireball: 2, AuraCharge: 3, Meteor: 4 },
  Luna: { Hitting: 1, AuraSmite: 2, Blessing: 3, Heal: 4 },
  Chrono: { Tick: 1, HourglassShard: 2, Haste: 3, Rewind: 4 },
  Kage: { Shuriken: 1, TwinFang: 2, SmokeBomb: 3, Assassinate: 4 },
  Morvane: { Drain: 1, SoulSiphon: 2, RaiseDead: 3, DeathCoil: 4 },
};

/** Skills whose declared action remains visibly charged while its clock cost is still pending. */
export const CASTING_SKILLS = new Set<SkillId>([
  'Guard',
  'CounterAttack',
  'Trap',
  'Fireball',
  'Meteor',
  'Heal',
  'Blessing',
  'AuraCharge',
]);

export function isCastingSkill(skillId: SkillId | null): skillId is SkillId {
  return skillId !== null && CASTING_SKILLS.has(skillId);
}

/** Which characters have a painted 4x5 sheet on disk. */
export function hasSpriteSheet(charId: CharId): boolean {
  return Object.keys(ACTION_ROW[charId]).length > 0;
}

/** Every hit row is WebP now. The four that used to stay PNG — the three generated rows plus Kit's
 *  rebuilt clean one — were kept that way "to preserve clean alpha in every browser decoder", which
 *  was the right call against the pale extraction fringe of that era. It no longer applies: the
 *  v0.4.0 halo fix repainted those contours and *added a soft alpha edge*, and a measured alpha
 *  histogram now puts all four well outside the hard-cutout band that a lossy encoder fringes. They
 *  are ordinary q90 WebP like the rest of the roster. */
export function heroHitSpriteUrl(charId: CharId): string {
  return `/assets/sprites/hit/${charId}.webp`;
}

export function spriteActionRow(charId: CharId, skillId: SkillId | null): number {
  return skillId ? ACTION_ROW[charId][skillId] ?? 0 : 0;
}

/** Four-frame × five-row pixel sheet: idle on row 0, then one row for every class skill. */
export function HeroSprite({
  charId,
  skillId,
  actionId,
  hitId,
  casting = false,
  alive,
}: {
  charId: CharId;
  skillId: SkillId | null;
  actionId?: number;
  hitId?: number;
  casting?: boolean;
  alive: boolean;
}) {
  if (!hasSpriteSheet(charId)) return null;

  const isHit = hitId !== undefined && alive;
  const row = isHit ? 0 : spriteActionRow(charId, skillId);
  const animationClass = isHit
    ? 'hero-sprite--hit'
    : row === 0
      ? 'hero-sprite--idle'
      : casting
        ? 'hero-sprite--casting'
        : 'hero-sprite--action';
  const style = {
    '--sprite-sheet': `url(${isHit ? heroHitSpriteUrl(charId) : `/assets/sprites/${charId}.webp`})`,
    '--sprite-size': isHit ? '400% 100%' : '400% 500%',
    '--sprite-row': `${row * 25}%`,
  } as CSSProperties;

  return (
    <div
      key={isHit ? `hit-${hitId}` : casting ? `casting-${skillId}` : `${actionId ?? 'idle'}-${row}`}
      role="img"
      aria-label={charId}
      className={`hero-sprite ${animationClass} ${alive ? '' : 'hero-sprite--down'}`}
      style={style}
    />
  );
}
