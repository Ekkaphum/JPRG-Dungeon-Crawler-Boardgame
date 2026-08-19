import type { BossId, CharId } from '@engine/index';
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
const BOSS_ART: Record<BossId, string> = { Ragorath: 'Wrath', Somnivar: 'Sloth', Aurelius: 'Pride' };

export function charImageUrl(charId: CharId): string {
  return `/assets/cards/${CHAR_ART[charId]}.webp`;
}
export function itemImageUrl(itemId: ItemId): string {
  return `/assets/items/${itemId}.webp`;
}
export function bossImageUrl(bossId: BossId): string {
  return `/assets/bosses/${BOSS_ART[bossId]}.webp`;
}
export function bossSpriteUrl(bossId: BossId): string {
  return `/assets/sprites/bosses/${bossId}.webp`;
}
/** Each active boss owns a themed wide arena; screens without a current boss keep the shared
 *  fallback arena so scoring and generic defeat states remain well-defined. */
export function sceneImageUrl(bossId?: BossId): string {
  return bossId ? `/assets/backgrounds/${bossId}.webp` : `/assets/board/arena.webp`;
}
