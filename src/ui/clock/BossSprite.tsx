import type { BossId } from '@engine/index';
import { bossSpriteUrl } from '@ui/common/assets';
import type { CSSProperties } from 'react';
import { bossActionRow, type BossMoveKey } from './bossSpriteRows';

export function BossSprite({
  bossId,
  moveKey,
  actionId,
}: {
  bossId: BossId;
  moveKey: BossMoveKey | null;
  actionId?: number;
}) {
  const row = bossActionRow(bossId, moveKey);
  const style = {
    '--boss-sprite-sheet': `url(${bossSpriteUrl(bossId)})`,
    '--boss-sprite-row': `${row * 50}%`,
  } as CSSProperties;

  return (
    <div
      key={`${actionId ?? 'idle'}-${row}`}
      role="img"
      aria-label={bossId}
      className={`boss-sprite ${row > 0 ? 'boss-sprite--action' : 'boss-sprite--idle'}`}
      style={style}
    />
  );
}
