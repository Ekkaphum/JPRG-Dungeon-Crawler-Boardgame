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

/** Which characters have a painted 4x5 sheet on disk. */
export function hasSpriteSheet(charId: CharId): boolean {
  return Object.keys(ACTION_ROW[charId]).length > 0;
}

/** Generated rows and Kit's rebuilt clean hit row stay PNG to preserve clean alpha in every
 *  browser decoder. */
export function heroHitSpriteUrl(charId: CharId): string {
  const extension = charId === 'Chrono' || charId === 'Kage' || charId === 'Morvane' || charId === 'Kit' ? 'png' : 'webp';
  return `/assets/sprites/hit/${charId}.${extension}`;
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
  alive,
}: {
  charId: CharId;
  skillId: SkillId | null;
  actionId?: number;
  hitId?: number;
  alive: boolean;
}) {
  if (!hasSpriteSheet(charId)) return null;

  const isHit = hitId !== undefined && alive;
  const row = isHit ? 0 : spriteActionRow(charId, skillId);
  // A skill sits in a fighter's `pending` from the moment it's declared until it lands several
  // slots later (see Fighter.pending in engine/clock/types.ts) — actionId is only set for the
  // brief resolve-time flash, so a defined row with no actionId means "still charging," and gets
  // the looping idle animation (holding that skill's pose) instead of the one-shot action punch.
  const isCharging = !isHit && actionId === undefined && row > 0;
  const style = {
    '--sprite-sheet': `url(${isHit ? heroHitSpriteUrl(charId) : `/assets/sprites/${charId}.png`})`,
    '--sprite-size': isHit ? '400% 100%' : '400% 500%',
    '--sprite-row': `${row * 25}%`,
  } as CSSProperties;

  return (
    <div
      key={isHit ? `hit-${hitId}` : `${actionId ?? 'idle'}-${row}`}
      role="img"
      aria-label={charId}
      className={`hero-sprite ${isHit ? 'hero-sprite--hit' : isCharging || row === 0 ? 'hero-sprite--idle' : 'hero-sprite--action'} ${alive ? '' : 'hero-sprite--down'}`}
      style={style}
    />
  );
}
