import type { BossAppearance, BossId, CharId } from '@engine/index';
import type { ItemId } from '@content/items';

// The original four keep their class-named files for compatibility with frozen builds. The v0.4
// roster has character-named painted cards, so every live CharId now resolves to real card art.
const CHAR_ART: Record<CharId, string> = {
  Eric: 'Knight',
  Kit: 'Ranger',
  Liora: 'Wizard',
  Luna: 'Cleric',
  Chrono: 'Chrono',
  Kage: 'Kage',
  Morvane: 'Morvane',
};
/** Painted card art. Only the three original bosses have any — the nine added with the Seven Sins
 *  and Chess series ship with sprite sheets only, so `bossImageUrl` returns null for them and the
 *  detail panel draws the sprite instead. Listing them as an explicit partial record rather than
 *  falling back to a stand-in image keeps that honest: a boss with no card art shows its actual
 *  self, not somebody else's portrait. */
const BOSS_ART: Partial<Record<BossId, string>> = { Ragorath: 'Wrath', Somnivar: 'Sloth', Aurelius: 'Pride' };

/** Bosses with their own themed arena background. Everything else falls back to the shared arena. */
const BOSS_SCENES: BossId[] = ['Ragorath', 'Somnivar', 'Aurelius'];

export function charImageUrl(charId: CharId): string {
  return `/assets/cards/${CHAR_ART[charId]}.webp`;
}
export function itemImageUrl(itemId: ItemId): string {
  return `/assets/items/${itemId}.webp`;
}
/** null when this boss has no painted card — callers fall back to the sprite. */
export function bossImageUrl(bossId: BossId): string | null {
  const art = BOSS_ART[bossId];
  return art ? `/assets/bosses/${art}.webp` : null;
}
export function bossSpriteUrl(appearance: BossAppearance): string {
  return `/assets/sprites/bosses/${appearance}.webp`;
}
export function bossHitSpriteUrl(appearance: BossAppearance): string {
  return `/assets/sprites/hit/${appearance}.webp`;
}
/** Bosses with their own themed wide arena get it; everything else — including every screen with no
 *  current boss at all — keeps the shared fallback arena, so scoring and defeat states stay
 *  well-defined and a boss without a painted background never 404s mid-battle. */
export function sceneImageUrl(bossId?: BossId): string {
  return bossId && BOSS_SCENES.includes(bossId) ? `/assets/backgrounds/${bossId}.webp` : `/assets/board/arena.webp`;
}
