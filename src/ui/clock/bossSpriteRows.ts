import type { BossId } from '@engine/index';

export type BossMoveKey = 'A' | 'B' | 'C';

const CAST_MOVES: Record<BossId, ReadonlySet<BossMoveKey>> = {
  Ragorath: new Set(['C']),
  Somnivar: new Set(['C']),
  Aurelius: new Set(['B', 'C']),
};

/** Row 0 is idle, row 1 is a physical/impact move, and row 2 is spellcasting. */
export function bossActionRow(bossId: BossId, moveKey: BossMoveKey | null): number {
  if (!moveKey) return 0;
  return CAST_MOVES[bossId].has(moveKey) ? 2 : 1;
}
