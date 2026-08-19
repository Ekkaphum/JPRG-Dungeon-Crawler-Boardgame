// v0.5 "camp" ruleset — the item deck sold at the camp between boss battles.
//
// Design constraints this file is held to (docs/DESIGN_VARIABLES.md §6.4, EXPANSION_DESIGN §1.6):
//
//  1. **Sideways, not upward.** An item gives a new *option*, never a bigger permanent number. If
//     items scaled damage, bosses 2 and 3 would get progressively easier and every tuned number in
//     BALANCE_NOTES would be void. The strongest raw-damage item here is +5 on one hit.
//  2. **Mostly consumable.** 14 of 16 types are spent on use, so the power a party carries into the
//     last boss is bounded by what it can afford *that camp* rather than by everything it ever
//     bought. The two permanents are deliberately narrow and defensive.
//  3. **One line of rules text.** Anything needing a paragraph belongs on a character card.
//  4. **Reference the board, not the person.** No item names a character, so an item bought by a
//     future expansion character works exactly the same.
//
// Items are used as a FREE ACTION on your own visit, before you declare — any number of them, no ⏱
// cost. That is the cheapest possible reaction window: it needs no new yield shape and no change to
// the turn order, because the decision is folded into the DECLARE_ACTION choice the player is
// already making (see Choice.useItems in engine/clock/types.ts).

export type ItemId =
  // 3 gems
  | 'HerbPotion'
  | 'HolyWater'
  | 'PowerElixir'
  | 'SwiftDraught'
  | 'IronTonic'
  | 'ArmorSpike'
  // 5 gems
  | 'GreaterPotion'
  | 'BulwarkCharm'
  | 'Grapnel'
  | 'GreaterSwift'
  | 'VanguardBanner'
  | 'VenomCoating'
  // 8 gems
  | 'PhoenixDraught'
  | 'SmokeBomb'
  | 'WeaknessLens'
  // permanent
  | 'RevivalCharm'
  | 'TimeAnchor';

/** What the effect actually does. One kind per item keeps the resolver a flat switch rather than a
 *  scripting language — see engine/clock/items.ts. */
export type ItemKind =
  | 'heal' // restore HP to a chosen living ally (or self)
  | 'cleanse' // strip every ailment from a chosen ally
  | 'atkBuff' // next attack this battle deals +N
  | 'haste' // the action declared this visit costs N less ⏱
  | 'ward' // flat damage reduction until your next visit
  | 'pierce' // next attack ignores armor
  | 'absorb' // cancel up to N damage from the next hit that lands on you
  | 'poisonSlots' // write damage onto the next N clock slots (no roll, fires on arrival)
  | 'revive' // stand a downed ally up immediately
  | 'bossPush' // shove the boss pawn back N slots
  | 'weakPoint' // open the boss's weak point
  | 'queueJump' // choose your resolve order while stacked, this battle
  | 'reviveFast' // PERMANENT: your own revival comes N slots sooner
  | 'antiDisplace'; // PERMANENT: boss moves cannot slide your pawn

export interface ItemDef {
  id: ItemId;
  kind: ItemKind;
  cost: 3 | 5 | 8;
  /** False for the two permanents — they stay on the character sheet once bought. */
  consumable: boolean;
  /** Whether using it needs a target chosen (heal/cleanse/revive). */
  targeted?: boolean;
  /** Effect magnitude; meaning depends on kind. */
  value: number;
  name: { th: string; en: string };
  text: { th: string; en: string };
}

export const ITEMS: Record<ItemId, ItemDef> = {
  // ─────────── 3 gems — the staples, three copies each in the deck ───────────
  HerbPotion: {
    id: 'HerbPotion', kind: 'heal', cost: 3, consumable: true, targeted: true, value: 6,
    name: { th: 'ยาสมุนไพร', en: 'Herb Potion' },
    text: { th: 'ฟื้น 6 HP ให้ตัวเองหรือเพื่อน', en: 'Restore 6 HP to yourself or an ally.' },
  },
  HolyWater: {
    id: 'HolyWater', kind: 'cleanse', cost: 3, consumable: true, targeted: true, value: 0,
    name: { th: 'น้ำมนต์', en: 'Holy Water' },
    text: { th: 'ล้างสถานะผิดปกติทั้งหมดของเป้าหมาย 1 คน', en: 'Remove every ailment from one target.' },
  },
  PowerElixir: {
    id: 'PowerElixir', kind: 'atkBuff', cost: 3, consumable: true, value: 5,
    name: { th: 'ยาเพิ่มพลัง', en: 'Power Elixir' },
    text: { th: 'การโจมตีครั้งถัดไปของคุณ +5 ดาเมจ', en: 'Your next attack deals +5 damage.' },
  },
  SwiftDraught: {
    id: 'SwiftDraught', kind: 'haste', cost: 3, consumable: true, value: 1,
    name: { th: 'ยาเร่งเวลา', en: 'Swift Draught' },
    text: { th: 'แอคชันที่ประกาศตานี้ −1 ⏱', en: 'The action you declare this visit costs 1 less ⏱.' },
  },
  IronTonic: {
    id: 'IronTonic', kind: 'ward', cost: 3, consumable: true, value: 4,
    name: { th: 'ยาเกราะเหล็ก', en: 'Iron Tonic' },
    text: { th: 'ดาเมจที่เข้าตัวคุณ −4 จนถึงตาถัดไป', en: 'Incoming damage reduced by 4 until your next visit.' },
  },
  ArmorSpike: {
    id: 'ArmorSpike', kind: 'pierce', cost: 3, consumable: true, value: 0,
    name: { th: 'ตะปูเจาะเกราะ', en: 'Armor Spike' },
    text: { th: 'การโจมตีครั้งถัดไปของคุณไม่สนเกราะ', en: 'Your next attack ignores armor.' },
  },

  // ─────────── 5 gems — two copies each ───────────
  GreaterPotion: {
    id: 'GreaterPotion', kind: 'heal', cost: 5, consumable: true, targeted: true, value: 12,
    name: { th: 'ยาฟื้นใหญ่', en: 'Greater Potion' },
    text: { th: 'ฟื้น 12 HP ให้ตัวเองหรือเพื่อน', en: 'Restore 12 HP to yourself or an ally.' },
  },
  BulwarkCharm: {
    id: 'BulwarkCharm', kind: 'absorb', cost: 5, consumable: true, value: 10,
    name: { th: 'โล่กันกระแทก', en: 'Bulwark Charm' },
    // The "interrupt the boss" item: bought and spent on your own visit, but its effect waits and
    // fires when the boss actually swings. That is how a reactive tool exists without a reaction
    // window — the commitment is made in advance, which is also what makes it a real decision.
    text: { th: 'กันดาเมจครั้งถัดไปที่เข้าตัวคุณ สูงสุด 10', en: 'Absorb up to 10 damage from the next hit on you.' },
  },
  Grapnel: {
    id: 'Grapnel', kind: 'bossPush', cost: 5, consumable: true, value: 2,
    name: { th: 'ตะขอเกี่ยว', en: 'Grapnel' },
    text: { th: 'ดันหมากบอสถอยหลัง 2 ช่อง', en: "Shove the boss's pawn back 2 slots." },
  },
  GreaterSwift: {
    id: 'GreaterSwift', kind: 'haste', cost: 5, consumable: true, value: 2,
    name: { th: 'ยาเร่งใหญ่', en: 'Greater Swift' },
    text: { th: 'แอคชันที่ประกาศตานี้ −2 ⏱', en: 'The action you declare this visit costs 2 less ⏱.' },
  },
  VanguardBanner: {
    id: 'VanguardBanner', kind: 'queueJump', cost: 5, consumable: true, value: 0,
    name: { th: 'ธงนำทัพ', en: 'Vanguard Banner' },
    text: { th: 'ย้ายหมากคุณไปบนสุดของกองในช่องนี้ (ได้เล่นก่อน)', en: 'Move your pawn to the top of its stack — you resolve first.' },
  },
  VenomCoating: {
    id: 'VenomCoating', kind: 'poisonSlots', cost: 5, consumable: true, value: 3,
    // Built on `scheduledHits`, the "write damage onto a future slot" primitive that has existed
    // since v0.3.0 with exactly one card using it (docs/DESIGN_VARIABLES.md §2 #12). No roll, no
    // boss-position check — it simply ticks as the marker walks past.
    name: { th: 'ยาพิษเคลือบ', en: 'Venom Coating' },
    text: { th: 'บอสเสีย 3 HP ตอนมาร์กเกอร์เดินผ่าน 3 ช่องถัดไป', en: 'The boss loses 3 HP on each of the next 3 slots.' },
  },

  // ─────────── 8 gems — one copy each ───────────
  PhoenixDraught: {
    id: 'PhoenixDraught', kind: 'revive', cost: 8, consumable: true, targeted: true, value: 0,
    name: { th: 'ยาชุบชีวิต', en: 'Phoenix Draught' },
    text: { th: 'ฟื้นเพื่อนที่ล้มอยู่ทันที ด้วย HP ปกติของการฟื้น', en: 'Stand a downed ally up immediately at their revival HP.' },
  },
  SmokeBomb: {
    id: 'SmokeBomb', kind: 'absorb', cost: 8, consumable: true, value: 99,
    name: { th: 'ระเบิดควัน', en: 'Smoke Bomb' },
    text: { th: 'ยกเลิกดาเมจครั้งถัดไปที่เข้าตัวคุณทั้งหมด', en: 'Negate the next hit on you entirely.' },
  },
  WeaknessLens: {
    id: 'WeaknessLens', kind: 'weakPoint', cost: 8, consumable: true, value: 0,
    name: { th: 'แว่นส่องจุดอ่อน', en: 'Weakness Lens' },
    text: { th: 'เปิดจุดอ่อนบอสทันที (ทั้งวง +4)', en: "Open the boss's weak point at once (+4 for everyone)." },
  },

  // ─────────── permanent — one copy each, deliberately defensive ───────────
  RevivalCharm: {
    id: 'RevivalCharm', kind: 'reviveFast', cost: 8, consumable: false, value: 3,
    name: { th: 'เครื่องรางคืนชีพ', en: 'Revival Charm' },
    text: { th: 'ถาวร: ถ้าคุณล้ม ฟื้นเร็วขึ้น 3 ช่อง', en: 'Permanent: your revival comes 3 slots sooner.' },
  },
  TimeAnchor: {
    id: 'TimeAnchor', kind: 'antiDisplace', cost: 8, consumable: false, value: 0,
    name: { th: 'สมอเวลา', en: 'Time Anchor' },
    text: { th: 'ถาวร: ท่าบอสที่เลื่อนหมากผู้เล่น ไม่มีผลกับคุณ', en: 'Permanent: boss moves cannot slide your pawn.' },
  },
};

export const ITEM_IDS: ItemId[] = Object.keys(ITEMS) as ItemId[];

/** Deck composition — cheap staples are common, the 8-gem cards are one-offs, so a market row is
 *  usually affordable but the good stuff is contested. 34 cards; a 3-boss game reveals ~12-16. */
const COPIES: Record<3 | 5 | 8, number> = { 3: 3, 5: 2, 8: 1 };

export function buildItemDeck(): ItemId[] {
  const deck: ItemId[] = [];
  for (const id of ITEM_IDS) {
    for (let i = 0; i < COPIES[ITEMS[id].cost]; i++) deck.push(id);
  }
  return deck;
}

export function itemDef(id: ItemId): ItemDef {
  return ITEMS[id];
}
