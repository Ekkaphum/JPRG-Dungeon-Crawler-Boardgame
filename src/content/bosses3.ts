// v0.3.0 "clock" ruleset — boss data. Source of truth: ../../GAME_DESIGN_v0_3_0.md §9.
// Locked to the 4-player HP column (v0.3.0 is 4-players-only, see §12 ข้อ 2).
// Move targeting/special logic (Rage, sleep-tax, armor-break) lives in src/engine/clock/bossAI.ts
// — this file only holds the display data + numeric baselines from the doc's tables.

import type { AilmentId } from './ailments';

export type BossId = 'Ragorath' | 'Somnivar' | 'Aurelius';
export const BOSS_IDS: BossId[] = ['Ragorath', 'Somnivar', 'Aurelius'];

export interface BossMoveDef {
  key: 'A' | 'B' | 'C';
  diceRange: [number, number]; // inclusive d6 range
  name: { th: string; en: string };
  /** v0.4.0: ailment this move inflicts on everyone it hits, on top of its damage. Ignored entirely
   *  in the v0.3.x ruleset. Luna's Holy Water passive cancels this when the move is single-target
   *  and aimed at her — the first time that passive has ever had anything to cancel. */
  inflicts?: AilmentId;
  /** v0.3.14: this is now a **cooldown**, not a wind-up. Every boss move resolves the instant the
   *  boss's pawn is visited; `time` is how far the pawn then walks before it can act again. The
   *  old `immediate?: boolean` opt-in is gone because every move is immediate — what the party can
   *  read off the board is *when* the boss acts (its pawn), never *what* it is about to do. */
  time: number;
  desc: { th: string; en: string };
}

/** v0.4.0 descriptive axes. Pure data — none of them changes a number on its own. They exist so a
 *  rule can be written *against* them (see `resistsAilment` below), which is the whole point of
 *  docs/DESIGN_VARIABLES.md §3.3: "race should be a rule exception, not +2 damage". */
export type BossRace = 'demon' | 'dreamspawn' | 'golem';
export type BossSize = 'large' | 'colossal';
export type Element = 'fire' | 'ice' | 'lightning' | 'light' | 'dark' | 'poison' | 'wind' | 'earth';

export interface BossDef {
  id: BossId;
  /** v0.5 "camp" ruleset: gems every player receives for defeating this boss, on top of the
   *  leftover-time bonus. Printed on the boss sheet and announced before the fight starts, so the
   *  party can plan its shopping around which boss is next rather than discovering the payout
   *  afterwards. Rises across the queue so each camp feels larger than the last. */
  gemReward: number;
  name: { th: string; en: string };
  sin: { th: string; en: string };
  hp: number;
  startSlot: number;
  armor: number;
  /** v0.4.0 axes — inert in the v0.3.x ruleset. */
  race: BossRace;
  size: BossSize;
  element: Element;
  /** Ailment families this boss shrugs off, declared as families rather than as a list of ids so a
   *  new ailment never requires revisiting every boss. */
  immuneTo: { mental?: boolean; physical?: boolean };
  /** What the party can exploit. Display text; the mechanical half lives in bossAI.ts. */
  weakness: { th: string; en: string };
  moves: [BossMoveDef, BossMoveDef, BossMoveDef];
}

export const BOSSES: Record<BossId, BossDef> = {
  Ragorath: {
    id: 'Ragorath',
    name: { th: 'Ragorath, the Bloodhorn', en: 'Ragorath, the Bloodhorn' },
    sin: { th: 'โทสะ', en: 'Wrath' },
    // hp 76 -> 91 (2026-08-13, equal-start compensation) -> 72 (v0.3.14). Every boss now acts on
    // the visit it is rolled instead of the one after, which is worth roughly a whole extra action
    // per battle, and Skyward Gore's dice can catch the entire party. Measured hard clear 83.5% ->
    // 50.9% before this cut, 81.7% after — the *character* of the fight changed, its power did not.
    hp: 76,
    gemReward: 6,
    startSlot: 23,
    armor: 0,
    // v0.4.0. Demon: the flavour half of "pays HP for power" — Rage already is that mechanic, so
    // the race label is describing the boss he already was rather than adding a rule.
    race: 'demon',
    size: 'large',
    element: 'fire',
    // He is made of fire; burning him is not a plan. Nothing else is off the table, which makes him
    // the boss where ailments are most freely usable.
    immuneTo: {},
    weakness: {
      th: '❄️ น้ำแข็ง — ทุกครั้งที่โดนดาเมจธาตุน้ำแข็ง Rage ลด 1 · เขาคือบอสที่ลงสถานะได้อิสระที่สุด',
      en: 'Ice — every ice hit bleeds 1 Rage off him. He is also the boss most open to ailments.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'เขาเสยฟ้า', en: 'Skyward Gore' },
        time: 4,
        // 🩸 on the dice move rather than the AoE: it can single out one player, and bleed punishes
        // whoever acts most — so the party's busiest character pays for being busy.
        inflicts: 'bleed',
        desc: {
          th: 'ทอย d6 · 1-4 ตีผู้เล่นคนนั้น · 5 ตีทุกคน · 6 ทอยใหม่พร้อม Rage +1 · dmg 6 + Rage',
          en: 'Roll d6 · 1-4 hits that player · 5 hits everyone · 6 rerolls with Rage +1 · dmg 6 + Rage',
        },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'กระทืบพื้น', en: 'Ground Stomp' },
        time: 5,
        inflicts: 'daze',
        desc: { th: 'ตีทุกคน · dmg 4 + Rage', en: 'Hits everyone · dmg 4 + Rage' },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'บ้าคลั่ง', en: 'Frenzy' },
        time: 3,
        // Frenzy already hunts the party's best damage dealer; 🔥 burn on top means their reward
        // for leading the damage race is a second hit on their own next visit.
        inflicts: 'burn',
        desc: {
          th: 'ตีผู้เล่นที่ทำดาเมจรวมสูงสุดในยกนี้ · dmg 10 + Rage',
          en: 'Hits whoever has dealt the most damage this battle · dmg 10 + Rage',
        },
      },
    ],
  },
  Somnivar: {
    id: 'Somnivar',
    name: { th: 'Somnivar, the Eternal Sleeper', en: 'Somnivar, the Eternal Sleeper' },
    sin: { th: 'เกียจคร้าน', en: 'Sloth' },
    // hp 80 -> 96 (2026-08-13) -> 76 (v0.3.11) -> 46 (v0.3.14). The biggest cut of the three, and
    // it has to be: every one of his moves lost a slot (⏱4/5/6 -> 3/4/5) *and* Nightmare went from
    // one 11 to two 7s, so he acts about a third more often for more damage each time. Uncompensated
    // he was the wall the run died on — hard clear 93.8% -> 34.0% conditional. Now 92.8%.
    hp: 48,
    gemReward: 8,
    startSlot: 23,
    armor: 0,
    // v0.4.0. Dreamspawn: he *is* the sleep, so nothing mental lands on him — the family he deals
    // in is the family he ignores, which is the cleanest form the "rule exception" idea takes on
    // any of the three.
    race: 'dreamspawn',
    size: 'colossal',
    element: 'dark',
    immuneTo: { mental: true },
    weakness: {
      th: '✨ แสง — ล้างสถานะทางจิตของทั้งวงได้ และเป็นทางเดียวที่ตัดวงจรขโมยเวลาของเขา',
      en: 'Light — the only thing that cleanses his mental ailments off the party and breaks his time-theft loop.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'ลมหายใจง่วงงุน', en: 'Drowsy Breath' },
        time: 3,
        // He already taxes ⏱ through his aura; 💫 daze on top means the tax compounds on whoever
        // he actually breathes on, which is the difference between an aura and an attack.
        inflicts: 'daze',
        desc: { th: 'ตีทุกคน dmg 4 · ผู้เล่นทุกคนเดินหมากลงเพิ่ม 1 ช่อง', en: 'Hits everyone for 4 · every player pawn slides down 1 more slot' },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'ฝันร้าย', en: 'Nightmare' },
        time: 4,
        // Single-target and mental — so this is the exact move Luna's Holy Water was written for.
        inflicts: 'blind',
        desc: {
          th: 'ทอย d6 หาเป้าสองครั้ง (ซ้ำคนเดิมได้) · dmg 7 ต่อครั้ง · ออก 5-6 ทอยใหม่ และเลื่อนหมากคนที่โดนลง 1 ทุกครั้งที่ทอยใหม่',
          en: 'Rolls d6 twice for targets (repeats allowed) · dmg 7 each · a 5-6 rerolls and slides the eventual target down 1 slot per reroll',
        },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'หลับใหลนิรันดร์', en: 'Eternal Slumber' },
        // ❄️ freeze is the ailment version of what the move already does to the clock.
        inflicts: 'freeze',
        time: 5,
        desc: { th: 'ไม่ทำดาเมจ · เลื่อนหมากผู้เล่นทุกคนลง 4 ช่อง', en: 'No damage · every player pawn slides down 4 slots' },
      },
    ],
  },
  Aurelius: {
    id: 'Aurelius',
    name: { th: 'Aurelius, the Crowned Colossus', en: 'Aurelius, the Crowned Colossus' },
    sin: { th: 'อหังการ', en: 'Pride' },
    // hp 88 -> 106 (2026-08-13) -> 96 (v0.3.11) -> 82 (v0.3.14). The smallest cut, because v0.3.14
    // also cut his own numbers hard (Procession 12->9, Judgment 7/14->4/9); he gained frequency and
    // lost per-hit weight, which nets out closer to even than the other two.
    hp: 88,
    gemReward: 10,
    startSlot: 23,
    armor: 2,
    // v0.4.0. Golem: no flesh to poison or bleed, and no mind to blind — the most ailment-proof
    // boss in the game, which is deliberate. He is the fight where the party has to win on damage
    // and armor management rather than on status tricks, so the new system has a boss that answers it.
    race: 'golem',
    size: 'colossal',
    element: 'light',
    immuneTo: { mental: true, physical: true },
    weakness: {
      th: '🧪 กัดกร่อน — เกราะของเขาคือทั้งหมดที่เขามี · ทุบเกราะแตก (ดาเมจเกิน 12) ยังเป็นทางหลักเหมือนเดิม',
      en: 'Corrosion — armor is his whole defence. Breaking it (a hit over 12) is still the main line.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'กระบวนแห่', en: 'Procession' },
        // ⏳ doom on the move that hunts the score leader: leading the table now starts a clock on
        // you, and the party has to spend something to cleanse it.
        inflicts: 'doom',
        time: 4,
        desc: {
          th: 'ตีผู้เล่นที่มีคะแนนสะสมสูงที่สุด · ทะลุ Blessing · dmg 9',
          en: 'Hits the player with the highest accumulated score · pierces Blessing · dmg 9',
        },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'บัลลังก์ทอง', en: 'Golden Throne' },
        time: 4,
        desc: { th: 'เกราะ +1 (สะสม) · ฟื้น 8 HP', en: 'Armor +1 (stacking) · heals 8 HP' },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'คำพิพากษา', en: 'Judgment' },
        time: 5,
        desc: {
          th: 'ตีทุกคน dmg 4 · ใครที่ HP ต่ำกว่าครึ่งรับ 9 แทน',
          en: 'Hits everyone for 4 · anyone below half HP takes 9 instead',
        },
      },
    ],
  },
};

export function rollBossMove(bossId: BossId, d6: number): BossMoveDef {
  const boss = BOSSES[bossId];
  return boss.moves.find((m) => d6 >= m.diceRange[0] && d6 <= m.diceRange[1])!;
}
