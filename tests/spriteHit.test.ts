import { describe, expect, it } from 'vitest';
import type { DamagePopup } from '@session/playback';
import { latestDamagePopupId } from '@ui/clock/spriteHit';

const popup = (id: number, kind: DamagePopup['kind']): DamagePopup => ({
  id,
  target: 'boss',
  amount: 4,
  kind,
});

describe('latestDamagePopupId', () => {
  it('uses the newest damage event', () => {
    expect(latestDamagePopupId([popup(1, 'damage'), popup(2, 'damage')])).toBe(2);
  });

  it('ignores healing events', () => {
    expect(latestDamagePopupId([popup(1, 'damage'), popup(2, 'heal')])).toBe(1);
    expect(latestDamagePopupId([popup(3, 'heal')])).toBeUndefined();
  });
});
