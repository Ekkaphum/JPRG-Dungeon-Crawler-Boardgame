import type { DamagePopup } from '@session/playback';

/** Floating combat numbers over a figure — red for damage taken, green for healing/revival.
 *  Absolutely positioned, so the parent must be `relative`. */
export function DamagePopups({ popups }: { popups: DamagePopup[] }) {
  if (popups.length === 0) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible z-20">
      {popups.map((p, i) => (
        <div
          key={p.id}
          className={`dmg-popup absolute left-1/2 top-1/3 -translate-x-1/2 font-display font-bold text-2xl ${
            p.kind === 'heal' ? 'popup-heal' : 'popup-dmg'
          }`}
          style={{ marginLeft: `${(i % 3) * 18 - 18}px` }}
        >
          {p.kind === 'heal' ? '+' : '-'}
          {p.amount}
        </div>
      ))}
    </div>
  );
}
