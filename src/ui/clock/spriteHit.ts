import type { DamagePopup } from '@session/playback';

/** Return the newest damage event, ignoring healing popups. */
export function latestDamagePopupId(popups: DamagePopup[]): number | undefined {
  for (let index = popups.length - 1; index >= 0; index -= 1) {
    if (popups[index].kind === 'damage') return popups[index].id;
  }
  return undefined;
}
