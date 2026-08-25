import type { CSSProperties } from 'react';
import type { BossAppearance, BossId } from '@engine/index';
import { bossImageUrl, bossSpriteUrl } from './assets';

/** A boss's face, wherever one is needed outside the battle stage — the detail modal, the result
 *  popup, the defeat screen, the tutorial.
 *
 *  Only the three original bosses have painted card art. The nine added with the Seven Sins and
 *  Chess series ship with sprite sheets only, so this falls back to the sheet's idle frame rather
 *  than to a placeholder or to somebody else's portrait: a boss with no card should still look like
 *  itself. The crop is `cover` done in CSS — the inner element carries the sheet cell's own aspect
 *  ratio and is grown to at least fill the box, so no boss is ever stretched.
 */
export function BossPortrait({
  bossId,
  appearance,
  className = '',
  grayscale = false,
}: {
  bossId: BossId;
  /** Which sheet to draw when falling back — pass the phase-2 appearance to show an uncrowned boss.
   *  Defaults to the boss's own id. */
  appearance?: BossAppearance;
  className?: string;
  grayscale?: boolean;
}) {
  const art = bossImageUrl(bossId);
  const tone = grayscale ? 'grayscale opacity-60' : '';

  if (art) {
    return <img src={art} alt={bossId} className={`object-cover ${tone} ${className}`} draggable={false} />;
  }

  const cell: CSSProperties = {
    aspectRatio: '350.5 / 374',
    minWidth: '100%',
    minHeight: '100%',
    backgroundImage: `url(${bossSpriteUrl(appearance ?? bossId)})`,
    backgroundSize: '400% 300%',
    backgroundPosition: '0% 0%',
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };
  return (
    <div role="img" aria-label={bossId} className={`overflow-hidden flex items-center justify-center ${tone} ${className}`}>
      <div style={cell} />
    </div>
  );
}
