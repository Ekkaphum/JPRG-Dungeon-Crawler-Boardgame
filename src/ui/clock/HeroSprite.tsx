import type { CharId, SkillId } from '@engine/index';
import type { CSSProperties } from 'react';

const ACTION_ROW: Record<CharId, Partial<Record<SkillId, number>>> = {
  Matt: { Slash: 1, PowerStrike: 2, Guard: 3, CounterAttack: 4 },
  Kit: { QuickShot: 1, SharpShooting: 2, Trap: 3, MultiShot: 4 },
  Vera: { AirPush: 1, Fireball: 2, AuraCharge: 3, Meteor: 4 },
  Luna: { Hitting: 1, AuraSmite: 2, Blessing: 3, Heal: 4 },
  Dax: {},
  Mira: {},
};

export function spriteActionRow(charId: CharId, skillId: SkillId | null): number {
  return skillId ? ACTION_ROW[charId][skillId] ?? 0 : 0;
}

/** Four-frame × five-row pixel sheet: idle on row 0, then one row for every class skill. */
export function HeroSprite({
  charId,
  skillId,
  actionId,
  alive,
}: {
  charId: CharId;
  skillId: SkillId | null;
  actionId?: number;
  alive: boolean;
}) {
  // Dax/Mira are not in the current draft roster and do not have production sprite sheets yet.
  if (charId === 'Dax' || charId === 'Mira') return null;

  const row = spriteActionRow(charId, skillId);
  const style = {
    '--sprite-sheet': `url(/assets/sprites/${charId}.png)`,
    '--sprite-row': `${row * 25}%`,
  } as CSSProperties;

  return (
    <div
      key={`${actionId ?? 'idle'}-${row}`}
      role="img"
      aria-label={charId}
      className={`hero-sprite ${row > 0 ? 'hero-sprite--action' : 'hero-sprite--idle'} ${alive ? '' : 'hero-sprite--down'}`}
      style={style}
    />
  );
}
