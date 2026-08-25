import type { BossAppearance, BossId } from '@engine/index';

export type BossMoveKey = 'A' | 'B' | 'C';

/** Which moves are spellcasts rather than physical blows — row 2 of the sheet instead of row 1.
 *  Keyed by *appearance* rather than by boss id so the two phase-2 sheets, which have their own
 *  move tables, can pick their own rows instead of inheriting phase 1's. */
const CAST_MOVES: Record<BossAppearance, ReadonlySet<BossMoveKey>> = {
  // ── sins ──
  Ragorath: new Set(['C']),
  Levithar: new Set(['A', 'C']),
  Somnivar: new Set(['C']),
  Gulvorax: new Set(['C']),
  Mammorax: new Set(['B', 'C']),
  Asmodeus: new Set(['A', 'C']),
  Aurelius: new Set(['B', 'C']),
  AureliusUncrowned: new Set(['A', 'C']),
  // ── chess ──
  // The pieces are soldiers first: only the Bishop and the Queen cast at all, which is the same
  // split the board itself makes between a piece that moves and a piece that commands.
  PawnRank: new Set([]),
  Knight: new Set([]),
  Rook: new Set(['B']),
  Bishop: new Set(['A', 'B', 'C']),
  Queen: new Set(['B']),
  King: new Set(['C']),
};

/** Row 0 is idle, row 1 is a physical/impact move, and row 2 is spellcasting. */
export function bossActionRow(appearance: BossAppearance, moveKey: BossMoveKey | null): number {
  if (!moveKey) return 0;
  return CAST_MOVES[appearance].has(moveKey) ? 2 : 1;
}

/** Kept for the handful of call sites that still address a boss by id alone. */
export function bossActionRowFor(bossId: BossId, moveKey: BossMoveKey | null): number {
  return bossActionRow(bossId, moveKey);
}
