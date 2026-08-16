import type { BossId } from '@engine/index';
import { bossSpriteUrl } from '@ui/common/assets';
import type { CSSProperties } from 'react';
import { bossActionRow, type BossMoveKey } from './bossSpriteRows';

export function BossSprite({
  bossId,
  moveKey,
  actionId,
  hitId,
}: {
  bossId: BossId;
  moveKey: BossMoveKey | null;
  actionId?: number;
  hitId?: number;
}) {
  const isHit = hitId !== undefined;
  const row = isHit ? 0 : bossActionRow(bossId, moveKey);
  const style = {
    '--boss-sprite-sheet': `url(${isHit ? `/assets/sprites/hit/${bossId}.webp` : bossSpriteUrl(bossId)})`,
    '--boss-sprite-size': isHit ? '400% 100%' : '400% 300%',
    '--boss-frame-aspect': isHit ? '1' : '350.5 / 374',
    '--boss-sprite-row': `${row * 50}%`,
  } as CSSProperties;

  return (
    <div
      key={isHit ? `hit-${hitId}` : `${actionId ?? 'idle'}-${row}`}
      role="img"
      aria-label={bossId}
      className={`boss-sprite ${isHit ? 'boss-sprite--hit' : row > 0 ? 'boss-sprite--action' : 'boss-sprite--idle'}`}
      style={style}
    />
  );
}
