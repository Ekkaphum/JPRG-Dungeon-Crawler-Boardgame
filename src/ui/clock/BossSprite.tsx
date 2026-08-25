import type { BossAppearance } from '@engine/index';
import { bossHitSpriteUrl, bossSpriteUrl } from '@ui/common/assets';
import type { CSSProperties } from 'react';
import { bossActionRow, type BossMoveKey } from './bossSpriteRows';

export function BossSprite({
  appearance,
  moveKey,
  actionId,
  hitId,
}: {
  appearance: BossAppearance;
  moveKey: BossMoveKey | null;
  actionId?: number;
  hitId?: number;
}) {
  const isHit = hitId !== undefined;
  const row = isHit ? 0 : bossActionRow(appearance, moveKey);
  const style = {
    '--boss-sprite-sheet': `url(${isHit ? bossHitSpriteUrl(appearance) : bossSpriteUrl(appearance)})`,
    '--boss-sprite-size': isHit ? '400% 100%' : '400% 300%',
    '--boss-frame-aspect': isHit ? '1' : '350.5 / 374',
    '--boss-sprite-row': `${row * 50}%`,
  } as CSSProperties;

  return (
    <div
      key={isHit ? `hit-${hitId}` : `${actionId ?? 'idle'}-${row}`}
      role="img"
      aria-label={appearance}
      className={`boss-sprite ${isHit ? 'boss-sprite--hit' : row > 0 ? 'boss-sprite--action' : 'boss-sprite--idle'}`}
      style={style}
    />
  );
}
