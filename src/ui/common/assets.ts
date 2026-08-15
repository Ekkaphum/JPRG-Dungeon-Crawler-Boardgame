import type { BossId, CharId } from '@engine/index';
import { hasSigil, sigilDataUri } from './charSigils';

// v0.3.0 reuses v0.1.0/v0.2.0's art wholesale — the "sin" names in GAME_DESIGN_v0_3_0.md §9 map
// 1:1 onto the old 7-boss roster, and the 4 kept classes map 1:1 onto old job art. Never rename
// the underlying files (see PLAN_v0.3.0.md §2) — the frozen public/versions/ builds hardcode
// absolute /assets/... paths to them. Only the original 4 have painted art; Dax/Mira (2026-08-11)
// render an SVG sigil instead — see charSigils.ts for why.
const CHAR_ART: Partial<Record<CharId, string>> = { Eric: 'Knight', Kit: 'Ranger', Liora: 'Wizard', Luna: 'Cleric' };
const BOSS_ART: Record<BossId, string> = { Ragorath: 'Wrath', Somnivar: 'Sloth', Aurelius: 'Pride' };

export function charImageUrl(charId: CharId): string {
  if (hasSigil(charId)) return sigilDataUri(charId);
  return `/assets/cards/${CHAR_ART[charId]}.webp`;
}
export function bossImageUrl(bossId: BossId): string {
  return `/assets/bosses/${BOSS_ART[bossId]}.webp`;
}
/** Wide battle backdrop built from the full arena artwork in ../../boardgen/Board_v2.png. The
 *  source art is portrait, so rather than cropping it into a letterbox (which read as a chopped-up
 *  collage) the whole painting sits centred at full height with a blurred, darkened enlargement of
 *  itself filling the flanks. Distinct file from board.webp so the frozen 0.1.0/0.2.0 builds, which
 *  reference /assets/board/board.webp, are unaffected. */
export function sceneImageUrl(): string {
  return `/assets/board/arena.webp`;
}
