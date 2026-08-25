// v0.3.0 "clock" ruleset — boss data. Source of truth: ../../GAME_DESIGN_v0_3_0.md §9.
// Locked to the 4-player HP column (v0.3.0 is 4-players-only, see §12 ข้อ 2).
// Move targeting/special logic (Rage, sleep-tax, armor-break) lives in src/engine/clock/bossAI.ts
// — this file only holds the display data + numeric baselines from the doc's tables.

import type { AilmentId } from './ailments';

/** Every boss in the box. Two complete series live here (docs/BOSS_SERIES_DESIGN.md §3 and §4);
 *  which of them a given game actually fights is decided by the game mode, not by this list. */
export type BossId =
  // ── ปีศาจแห่งบาป 7 · the Seven Deadly Sins (§3) ──
  | 'Ragorath'
  | 'Levithar'
  | 'Somnivar'
  | 'Gulvorax'
  | 'Mammorax'
  | 'Asmodeus'
  | 'Aurelius'
  // ── ตัวหมากรุก · the Chess Pieces (§4) ──
  | 'PawnRank'
  | 'Knight'
  | 'Rook'
  | 'Bishop'
  | 'Queen';

export type BossSeries = 'sins' | 'chess';

/** The three tuned bosses the game shipped on — the only queue with 5,000 simulated games behind
 *  it, and therefore the only one the 'classic' mode ever uses. Order is fixed and load-bearing:
 *  tests address Aurelius as `bossIndex = 2`. */
export const CLASSIC_BOSS_IDS: BossId[] = ['Ragorath', 'Somnivar', 'Aurelius'];

/** All seven sins, in the order §3.0 designs them (roughly ascending act). */
export const SINS_BOSS_IDS: BossId[] = ['Ragorath', 'Levithar', 'Somnivar', 'Gulvorax', 'Mammorax', 'Asmodeus', 'Aurelius'];

/** The chess series, in board order — one boss per act, Queen carrying the King as her phase 2. */
export const CHESS_BOSS_IDS: BossId[] = ['PawnRank', 'Knight', 'Rook', 'Bishop', 'Queen'];

export const ALL_BOSS_IDS: BossId[] = [...SINS_BOSS_IDS, ...CHESS_BOSS_IDS];

/** How many bosses a run of each mode fights. 'classic' is the tuned three; the two long modes are
 *  five, which is what docs/BOSS_SERIES_DESIGN.md §1 designs the act template around. */
export const LONG_RUN_BOSS_COUNT = 5;

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
export type BossRace = 'demon' | 'dreamspawn' | 'golem' | 'spirit';
export type BossSize = 'large' | 'colossal';
export type Element = 'fire' | 'ice' | 'lightning' | 'light' | 'dark' | 'poison' | 'wind' | 'earth';

/** A boss's second sheet. Only the two finales have one: it is flipped face up the moment the boss
 *  drops to half HP, and from then on every roll reads off `moves` here instead (docs §1.1). The
 *  shared flip rule — pawn jumps to the marker, every ⏱ drops by 1, accumulated armor and buffs are
 *  wiped — lives in bossAI.ts so both finales get it identically. */
export interface BossPhase2Def {
  name: { th: string; en: string };
  /** Which sprite sheet the second phase wears. Not a BossId: an uncrowned Aurelius and a cornered
   *  King are the same *boss* in a different state, so they must never become queueable entries. */
  sprite: BossAppearance;
  moves: [BossMoveDef, BossMoveDef, BossMoveDef];
}

/** Every sprite sheet under public/assets/sprites — the boss ids plus the two phase-2 appearances,
 *  which are art states rather than bosses. */
export type BossAppearance = BossId | 'AureliusUncrowned' | 'King';

export interface BossDef {
  id: BossId;
  series: BossSeries;
  /** Which act of the 5-act template (§1) this boss was designed for. Used to order a randomly
   *  drafted queue so difficulty still escalates — a run that opens on the finale and closes on the
   *  tutorial boss is five random fights, not a campaign. */
  tier: 1 | 2 | 3 | 4 | 5;
  /** Per-act HP from §3.0/§4 — the same idea the old sheets used when they printed one HP column
   *  per player count. `hp` below is the fallback for an act this boss was never designed for,
   *  which Free mode can always produce. */
  actHp?: Partial<Record<1 | 2 | 3 | 4 | 5, number>>;
  phase2?: BossPhase2Def;
  /** v0.4 camp: gems every player receives for defeating this boss, on top of the
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
    series: 'sins',
    // Act ① always, never drafted (§3.3): he is the only sin with no mechanic to explain, so he is
    // the one boss that can carry the lesson the whole game rests on — the boss never telegraphs.
    tier: 1,
    actHp: { 1: 58 },
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
    series: 'sins',
    // Locked to act ③ (§3.5): the only sin that singles nobody out, and the lowest-HP time thief in
    // the box. Moving him anywhere else breaks both numbers at once (v0.3.14: 76 → 46).
    tier: 3,
    actHp: { 3: 48 },
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
    series: 'sins',
    tier: 5,
    actHp: { 4: 72, 5: 88 },
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
    // §3.9. The cleanest inversion in the box: phase 1 is the armor puzzle, phase 2 is a race —
    // and because the flip wipes his accumulated armor, Kit and Luna, who spent the whole game
    // unable to dent him, become the most important seats at the table for the last three minutes.
    phase2: {
      name: { th: 'Aurelius, ถอดมงกุฎ', en: 'Aurelius, Uncrowned' },
      sprite: 'AureliusUncrowned',
      moves: [
        {
          key: 'A',
          diceRange: [1, 3],
          name: { th: 'พิพากษาไร้บัลลังก์', en: 'Throneless Judgment' },
          time: 3,
          desc: {
            th: 'ตีผู้เล่นที่มีคะแนนสะสมสูงสุด dmg 12 · ทะลุทุกการป้องกัน (Blessing · Guard · โล่ · ไอเทม)',
            en: 'Hits the highest-scoring player for 12, through every defence — Blessing, Guard, shields and items alike.',
          },
        },
        {
          key: 'B',
          diceRange: [4, 5],
          name: { th: 'ราชาที่ไม่ยอมล้ม', en: 'The King Who Will Not Fall' },
          time: 3,
          desc: { th: 'ไม่ฟื้น HP อีกแล้ว · หมากบอสเลื่อนขึ้น 2 ช่อง', en: 'No more healing — his pawn climbs 2 slots back up the clock instead.' },
        },
        {
          key: 'C',
          diceRange: [6, 6],
          name: { th: 'อวสานราชวงศ์', en: 'End of the Dynasty' },
          time: 4,
          inflicts: 'doom',
          desc: { th: 'ตีทุกคน dmg 8 · ⏳ ใส่ทุกคนที่ HP ต่ำกว่าครึ่ง', en: 'Hits everyone for 8 · ⏳ on anyone below half HP.' },
        },
      ],
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
  // ───────────────────────── §3.4 · ริษยา ─────────────────────────
  Levithar: {
    id: 'Levithar',
    series: 'sins',
    tier: 2,
    actHp: { 2: 68, 4: 78 },
    name: { th: 'Levithar, the Envious Tide', en: 'Levithar, the Envious Tide' },
    sin: { th: 'ริษยา', en: 'Envy' },
    hp: 68,
    gemReward: 5,
    startSlot: 23,
    armor: 0,
    // Spirit: it has no body to poison and no flesh to burn, but a mind that is the whole of it —
    // so it is the one boss immune to mental ailments for the opposite reason Somnivar is. He *is*
    // sleep; this thing is nothing but appetite.
    race: 'spirit',
    size: 'colossal',
    element: 'ice',
    immuneTo: { mental: true },
    weakness: {
      th: '🕊️ ความสันโดษ — ถ้าครบ 6 ช่องนาฬิกาที่ไม่มีใครได้บัฟจากคนอื่นเลย มันหิวโหย: เสีย 6 HP และแต้มริษยา −3',
      en: 'Solitude — six clock slots with nobody buffing anybody starves it: −6 HP and 3 envy bled off.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'คลื่นริษยา', en: 'Envious Tide' },
        time: 3,
        desc: {
          th: 'ตีทุกคน dmg 3 + (แต้มริษยา ÷ 2 ปัดลง)',
          en: 'Hits everyone for 3 + half its envy (rounded down)',
        },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'ริบ', en: 'Dispossess' },
        time: 4,
        // 🤐 silence on the move that strips buffs: it takes what the party gave each other, then
        // stops them from giving it again — the two halves of the same idea.
        inflicts: 'silence',
        desc: {
          th: 'ลบบัฟ 1 อย่างจากทุกคน · ตีผู้เล่นที่ได้รับบัฟจากคนอื่นมากที่สุด dmg 7 · แต้มริษยา +2',
          en: 'Strips one buff from everyone · hits whoever has received the most buffs from others for 7 · envy +2',
        },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'ท่วมท้น', en: 'Overflow' },
        time: 5,
        desc: {
          th: 'ตีทุกคน dmg = แต้มริษยา (เพดาน 12) · แล้วล้างแต้มริษยาเป็น 0',
          en: 'Hits everyone for damage equal to its envy (capped at 12), then resets envy to 0',
        },
      },
    ],
  },
  // ───────────────────────── §3.6 · ตะกละ ─────────────────────────
  Gulvorax: {
    id: 'Gulvorax',
    series: 'sins',
    tier: 3,
    actHp: { 3: 52, 4: 100 },
    name: { th: 'Gulvorax, the Endless Gullet', en: 'Gulvorax, the Endless Gullet' },
    sin: { th: 'ตะกละ', en: 'Gluttony' },
    hp: 52,
    gemReward: 7,
    startSlot: 23,
    armor: 1,
    race: 'demon',
    size: 'colossal',
    element: 'poison',
    immuneTo: { physical: true },
    weakness: {
      th: '🤢 อาหารเป็นพิษ — ไอเทมทุกใบที่ใช้ในยกนี้ถูกมันแย่งกินครึ่งหนึ่ง ยกเว้นไอเทมที่ใช้จากในท้อง: มันกลืนเต็มๆ แล้วท้องเสีย เสีย 8 HP และเสียตาถัดไปทั้งตา',
      en: 'Food poisoning — it eats half of every item used this battle, except one used from inside its belly: that one it swallows whole, costing it 8 HP and its entire next turn.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'ตะกละ', en: 'Devour' },
        time: 4,
        desc: {
          th: 'ถ้าท้องว่าง: กลืนผู้เล่นที่ถูกฟื้น HP รวมมากที่สุด · ถ้ามีคนอยู่ในท้องแล้ว: ตีทุกคน dmg 5 + จำนวนตาที่กินอยู่',
          en: 'If its belly is empty it swallows whoever has been healed the most; otherwise it hits everyone for 5 plus the number of turns it has held someone.',
        },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'ย่อย', en: 'Digest' },
        time: 3,
        inflicts: 'bleed',
        desc: {
          th: 'คนในท้องเสีย 6 HP และ Gulvorax ฟื้นเท่ากัน · ถ้าท้องว่าง: ตีคนที่ HP มากที่สุด dmg 8',
          en: 'The swallowed player loses 6 HP and Gulvorax heals the same; with an empty belly it hits the highest-HP player for 8 instead.',
        },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'ขย้อน', en: 'Regurgitate' },
        time: 5,
        inflicts: 'poison',
        desc: {
          th: 'คนในท้องถูกพ่นออกมาลงช่อง 0 · ตีทุกคน dmg 9',
          en: 'Spits the swallowed player out onto slot 0 · hits everyone for 9',
        },
      },
    ],
  },
  // ───────────────────────── §3.7 · โลภ ─────────────────────────
  Mammorax: {
    id: 'Mammorax',
    series: 'sins',
    tier: 4,
    actHp: { 4: 52, 5: 62 },
    name: { th: 'Mammorax, the Hoard That Breathes', en: 'Mammorax, the Hoard That Breathes' },
    sin: { th: 'โลภ', en: 'Greed' },
    hp: 52,
    gemReward: 9,
    startSlot: 23,
    // Zero printed armor on purpose: his hoard *is* his armor, and stacking a second, unstealable
    // layer on top of it took him to a measured 0% clear rate. The whole fight is supposed to be
    // "his defence is your payday", which only works if the defence is the part you can take.
    armor: 0,
    // Golem like Aurelius, but deliberately *not* ailment-proof: the two greedy statues would
    // otherwise play identically, and this one's whole defence is a pile that can be stolen.
    race: 'golem',
    size: 'colossal',
    element: 'earth',
    immuneTo: {},
    weakness: {
      th: '🔨 หมัดใหญ่เท่านั้น — ดาเมจย่อยละลายหายไปกับกองทอง · หมัดเดียวที่เข้าจริงเกิน 10 ปล้นทองได้ 2 ชิ้น และทองที่ปล้นได้กลายเป็น 💎 ของคนปล้นตอนจบยก',
      en: 'Big hits only — chip damage melts into the hoard. One hit landing over 10 robs 2 gold, and robbed gold becomes real gems for the robber at the end of the battle.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'เก็บส่วย', en: 'Collect the Tithe' },
        time: 4,
        desc: {
          th: 'ตีผู้เล่นที่มีไอเทมมากที่สุด dmg 8 และทำลายไอเทมของเขา 1 ใบ · ถ้าไม่มีไอเทมเลย dmg 11 แทน',
          en: 'Hits whoever holds the most items for 8 and destroys one of them — 11 instead if they hold none.',
        },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'หลอมทอง', en: 'Smelt' },
        time: 3,
        desc: { th: 'ทอง +3 · ฟื้น HP = จำนวนทอง ÷ 2 (ปัดลง)', en: 'Gold +3 · heals for half its hoard, rounded down' },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'คำสาปมิดาส', en: "Midas' Curse" },
        time: 5,
        inflicts: 'freeze',
        desc: {
          th: 'ตีทุกคน dmg 4 · ทุกคนคืนทองที่ปล้นมาแล้ว 1 ชิ้นเข้ากอง',
          en: 'Hits everyone for 4 · everyone returns 1 robbed gold to the hoard',
        },
      },
    ],
  },
  // ───────────────────────── §3.8 · ราคะ ─────────────────────────
  Asmodeus: {
    id: 'Asmodeus',
    series: 'sins',
    tier: 5,
    actHp: { 2: 66, 5: 126 },
    name: { th: 'Asmodeus, the Whispering Crown', en: 'Asmodeus, the Whispering Crown' },
    sin: { th: 'ราคะ', en: 'Lust' },
    hp: 66,
    gemReward: 6,
    startSlot: 23,
    armor: 1,
    race: 'demon',
    size: 'large',
    element: 'dark',
    immuneTo: {},
    weakness: {
      th: '🕊️ การปฏิเสธพร้อมกัน — ถ้าข้อเสนอใบหนึ่งไม่มีใครรับเลยจนถึงตาถัดไปของมัน Asmodeus เสีย 10 HP และเสียตานั้นทั้งตา',
      en: 'Collective refusal — an offer nobody takes before its next turn costs Asmodeus 10 HP and that entire turn.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'กระซิบ', en: 'Whisper' },
        time: 3,
        desc: {
          th: 'ตีทุกคนที่ปฏิเสธข้อเสนอครั้งก่อน dmg 6 · ถ้ามีคนรับ ไม่มีใครโดนเลย',
          en: 'Hits everyone who refused the last offer for 6 — if anybody took it, nobody is hit at all.',
        },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'จุมพิต', en: 'The Kiss' },
        time: 4,
        desc: {
          th: 'ตีผู้เล่นที่รับข้อเสนอไปแล้วมากที่สุด dmg 9 · Asmodeus ฟื้นเท่าดาเมจที่ทำได้ · คนที่โดนได้ 2 แต้ม',
          en: 'Hits whoever has accepted the most offers for 9, heals itself that much, and pays the victim 2 points.',
        },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'มนต์เสน่ห์', en: 'Enthrall' },
        time: 5,
        desc: {
          th: 'ผู้เล่นที่รับข้อเสนอมากที่สุดตกอยู่ใต้มนต์ 1 ตา — ตาถัดไปสกิลของเขาเข้าใส่เพื่อนแทนบอส · ตีคนที่เหลือ dmg 4',
          en: 'Whoever has accepted the most offers is enthralled for one turn — their next skill lands on an ally instead of the boss · everyone else takes 4.',
        },
      },
    ],
  },
  // ───────────────────────── §4.3 · เบี้ย ─────────────────────────
  PawnRank: {
    id: 'PawnRank',
    series: 'chess',
    tier: 1,
    actHp: { 1: 56 },
    name: { th: 'แถวเบี้ย', en: 'The Pawn Rank' },
    sin: { th: 'เดินหน้าอย่างเดียว', en: 'Advance' },
    hp: 56,
    gemReward: 4,
    startSlot: 23,
    armor: 0,
    race: 'golem',
    size: 'large',
    element: 'earth',
    immuneTo: { mental: true },
    weakness: {
      th: '⏪ ทุกครั้งที่เบี้ยถูกผลักถอย ขั้นลด 1 — และเพราะมันถอยไม่เป็น มันต้องเดินซ้ำทางเดิมทั้งหมด',
      en: 'Every push backwards strips a rank — and since a pawn cannot retreat, it must walk the whole road again.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'แทงหอก', en: 'Pike Thrust' },
        time: 2,
        inflicts: 'bleed',
        desc: { th: 'ตีผู้เล่นที่หมากอยู่ต่ำที่สุด dmg 4 + ขั้น', en: 'Hits whoever stands lowest on the clock for 4 + its rank' },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'ตั้งแถว', en: 'Close Ranks' },
        time: 2,
        desc: { th: 'ตีทุกคน dmg 2 + ขั้น · ขั้น +1', en: 'Hits everyone for 2 + its rank · rank +1' },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'เลื่อนขั้น', en: 'Promotion' },
        time: 3,
        desc: { th: 'ตีทุกคน dmg 5 + ขั้น · ขั้น +2', en: 'Hits everyone for 5 + its rank · rank +2' },
      },
    ],
  },
  // ───────────────────────── §4.4 · ม้า ─────────────────────────
  Knight: {
    id: 'Knight',
    series: 'chess',
    tier: 2,
    actHp: { 2: 52 },
    name: { th: 'ม้าศึก', en: 'The Knight' },
    sin: { th: 'กระโดดตัว L', en: 'The L-Jump' },
    hp: 52,
    gemReward: 5,
    startSlot: 23,
    armor: 0,
    race: 'demon',
    size: 'large',
    element: 'wind',
    immuneTo: {},
    weakness: {
      th: '🧱 กำแพงคน — ม้าข้ามได้ทุกอย่าง ยกเว้นช่องที่มีผู้เล่นยืนซ้อนกัน 2 คนขึ้นไป · เจอกำแพงคน มันหยุดตรงนั้นและเสียตาถัดไป',
      en: 'A wall of bodies — the Knight leaps over everything except a slot holding two or more players. That stops it dead and costs it its next turn.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'ตะบันควบ', en: 'Trampling Charge' },
        time: 3,
        desc: {
          th: 'ตีทุกคนที่อยู่ห่างจากหมากบอสไม่เกิน 2 ช่อง dmg 6 · คนที่อยู่ไกลกว่านั้นไม่โดนเลย',
          en: 'Hits everyone within 2 slots of its pawn for 6 — anyone further away is untouched.',
        },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'กระโดดสองชั้น', en: 'Double Leap' },
        time: 4,
        desc: { th: 'ม้ากระโดดตามกฎ 2 ครั้งติด · แต่ละครั้งตีคนที่มันลงข้าง dmg 5', en: 'Leaps twice by its own rule, hitting whoever it lands beside for 5 each time' },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'ม้าศึกบ้าคลั่ง', en: 'Frenzied Charger' },
        time: 4,
        inflicts: 'daze',
        desc: { th: 'ม้ากระโดด 3 ครั้ง · ตีทุกคนที่มันผ่านหรือลงข้าง dmg 4', en: 'Leaps three times, hitting everyone it passes or lands beside for 4' },
      },
    ],
  },
  // ───────────────────────── §4.5 · เรือ ─────────────────────────
  Rook: {
    id: 'Rook',
    series: 'chess',
    tier: 3,
    actHp: { 3: 50 },
    name: { th: 'ป้อมเคลื่อนที่', en: 'The Rook' },
    sin: { th: 'แล่นจนกว่าจะชน', en: 'Sail Until Blocked' },
    hp: 50,
    gemReward: 7,
    startSlot: 23,
    armor: 0,
    race: 'golem',
    size: 'colossal',
    element: 'earth',
    immuneTo: { mental: true, physical: true },
    weakness: {
      th: '🛑 เรือหยุดที่หมากตัวแรกเสมอ — คนที่ยอมเป็น "ตัวเบรก" คือคนที่เจ็บ แต่ก็เป็นคนที่กำหนดว่าบอสจะได้ลงมือเมื่อไหร่',
      en: 'The Rook always stops at the first pawn in its path. Whoever volunteers as the brake takes the hit — and decides when the boss gets to act.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'กระสุนตรง', en: 'Straight Shot' },
        time: 4,
        inflicts: 'bleed',
        desc: { th: 'ตีคนที่เรือหยุดขวางหน้า dmg 9 · ⏱ ไม่ได้พิมพ์ไว้ — มันแล่นจนกว่าจะชนหมากผู้เล่น', en: 'Hits whoever blocked it for 9. Its ⏱ is not printed: it sails until a player pawn stops it.' },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'กำแพงหิน', en: 'Stone Wall' },
        time: 4,
        desc: { th: 'เกราะ +2 · ตีคนที่เรือหยุดขวางหน้า dmg 4', en: 'Armor +2 · hits whoever blocked it for 4' },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'ถล่มป้อม', en: 'Rampart Collapse' },
        time: 5,
        desc: { th: 'ตีทุกคนที่อยู่ระหว่างจุดเริ่มกับจุดที่มันหยุด dmg 8 — มันแล่นทับทั้งเส้นทาง', en: 'Hits everyone between where it started and where it stopped for 8 — it runs the whole lane down' },
      },
    ],
  },
  // ───────────────────────── §4.6 · บิชอป ─────────────────────────
  Bishop: {
    id: 'Bishop',
    series: 'chess',
    tier: 4,
    actHp: { 4: 56 },
    name: { th: 'มุขนายกเงา', en: 'The Shadow Bishop' },
    sin: { th: 'ทแยงมุมสีเดียว', en: 'One Colour Only' },
    hp: 56,
    gemReward: 9,
    startSlot: 23,
    armor: 2,
    race: 'spirit',
    size: 'large',
    element: 'dark',
    immuneTo: { physical: true },
    weakness: {
      th: '⬛ ยืนช่องดำ = โดนเต็ม แต่ตีเต็มและทะลุเกราะ · ⬜ ยืนช่องขาว = ปลอดภัย แต่ดาเมจเหลือครึ่งเดียว · และท่า B สลับนิยามสีทั้งกระดาน',
      en: 'On a black slot you take everything and deal everything, armor ignored. On a white slot it cannot touch you and you deal half. Its B move swaps which is which.',
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'คำสวดเงา', en: 'Shadow Litany' },
        time: 4,
        inflicts: 'silence',
        desc: { th: 'ตีทุกคนที่อยู่ช่องดำ dmg 9 · ช่องขาวไม่โดน', en: 'Hits everyone on a black slot for 9 — white slots are untouched' },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'เปลี่ยนสี', en: 'Invert' },
        time: 3,
        desc: { th: 'สลับนิยามสีทั้งกระดาน (เลขคู่กลายเป็นดำ) · เกราะ +1', en: 'Swaps the colour of every slot on the clock · armor +1' },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'ทแยงมุมนิรันดร์', en: 'Eternal Diagonal' },
        time: 12,
        inflicts: 'doom',
        desc: { th: 'บิชอปกระโดดข้ามครึ่งวง (12 ช่อง) · ตีทุกคนที่อยู่ช่องสีเดียวกับมัน dmg 6', en: 'Leaps half the clock (12 slots) and hits everyone sharing its colour for 6' },
      },
    ],
  },
  // ───────────────────────── §4.7 · ราชินี → ราชา ─────────────────────────
  Queen: {
    id: 'Queen',
    series: 'chess',
    tier: 5,
    actHp: { 5: 72 },
    name: { th: 'ราชินี', en: 'The Queen' },
    sin: { th: 'เดินได้ทุกแบบ', en: 'Every Move at Once' },
    hp: 72,
    gemReward: 12,
    startSlot: 23,
    armor: 1,
    race: 'spirit',
    size: 'colossal',
    element: 'light',
    immuneTo: { mental: true },
    weakness: {
      th: '👑 เฟส 2 เปลี่ยนเงื่อนไขชนะ — ราชาเดินได้ครั้งละ 1 ช่อง และวงชนะทันทีถ้ามีหมากผู้เล่นอยู่ช่องติดกับราชาทั้งบนและล่างตอนมาร์กเกอร์ถึงเขา',
      en: 'Phase 2 changes the win condition: the King moves one slot at a time, and the party wins outright with a player pawn immediately above and below him when the marker arrives.',
    },
    phase2: {
      name: { th: 'ราชา', en: 'The King' },
      sprite: 'King',
      moves: [
        {
          key: 'A',
          diceRange: [1, 3],
          name: { th: 'ราชองครักษ์', en: 'Kingsguard' },
          time: 2,
          desc: { th: 'ตีทุกคนที่อยู่ในช่องติดกับราชา dmg 6 — ลงโทษคนที่กำลังพยายามรุกฆาตโดยตรง', en: 'Hits everyone in a slot adjacent to the King for 6 — it punishes exactly the players trying to checkmate him' },
        },
        {
          key: 'B',
          diceRange: [4, 5],
          name: { th: 'ถอยร่น', en: 'Withdraw' },
          time: 2,
          desc: { th: 'ราชาเลื่อนขึ้น 2 ช่อง (หนีออกจากวงล้อม)', en: 'The King climbs 2 slots back up, out of the closing net' },
        },
        {
          key: 'C',
          diceRange: [6, 6],
          name: { th: 'ราชโองการสุดท้าย', en: 'Final Decree' },
          time: 3,
          desc: { th: 'ตีทุกคน dmg 6 · ผลักทุกคนที่ประชิดออกห่างจากราชา 3 ช่อง', en: 'Hits everyone for 6 and shoves every adjacent pawn 3 slots away from him' },
        },
      ],
    },
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'ราชินีข้ามกระดาน', en: 'Queen Across the Board' },
        time: 4,
        desc: { th: 'เดินแบบเรือ (แล่นจนชน) · ตีคนที่ขวางหน้า dmg 10 · ทะลุเกราะ', en: 'Moves like the Rook — sails until blocked — and hits whoever blocked her for 10, ignoring armor' },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'บัญชาการ', en: 'Command' },
        time: 4,
        desc: { th: 'เดินแบบเบี้ย · เรียกเบี้ย 2 ตัววางบนช่อง (มาร์กเกอร์ −2 และ −4) ใครหยุดบนช่องนั้นรับ 5 · ตีทุกคน dmg 3', en: 'Moves like a Pawn · summons two pawn tokens 2 and 4 slots below the marker that deal 5 to whoever stops there · hits everyone for 3' },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'รุกฆาตซ้อน', en: 'Double Check' },
        time: 4,
        desc: { th: 'เดินแบบม้า · กระโดด 2 ครั้ง · ตีคนที่ลงข้าง dmg 8 ต่อครั้ง', en: 'Moves like the Knight — two leaps, hitting whoever she lands beside for 8 each time' },
      },
    ],
  },
};

/** The move table currently in play. Phase 2 exists on the two finales only; asking for it on any
 *  other boss quietly returns the normal sheet, so no call site has to know which bosses flip. */
export function bossMoves(bossId: BossId, phase: 1 | 2 = 1): readonly BossMoveDef[] {
  const boss = BOSSES[bossId];
  return phase === 2 && boss.phase2 ? boss.phase2.moves : boss.moves;
}

export function rollBossMove(bossId: BossId, d6: number, phase: 1 | 2 = 1): BossMoveDef {
  return bossMoves(bossId, phase).find((m) => d6 >= m.diceRange[0] && d6 <= m.diceRange[1])!;
}

/** Which sprite sheet to draw. Phase 2 wears its own art (§1.1) — an uncrowned Aurelius, a cornered
 *  King — without either becoming a boss the queue can contain. */
export function bossAppearance(bossId: BossId, phase: 1 | 2 = 1): BossAppearance {
  const boss = BOSSES[bossId];
  return phase === 2 && boss.phase2 ? boss.phase2.sprite : bossId;
}

export function bossDisplayName(bossId: BossId, phase: 1 | 2 = 1): { th: string; en: string } {
  const boss = BOSSES[bossId];
  return phase === 2 && boss.phase2 ? boss.phase2.name : boss.name;
}

/** HP for this boss in this act of the run. `act` is 1-based position in the queue.
 *
 *  A boss printed for act ② and dropped into act ⑤ by Free mode has no designed number, so it falls
 *  back to its own `hp`. That is deliberately *not* scaled up to fit the slot: inventing a curve
 *  here would quietly retune every boss in the box against numbers nobody has simulated, and §8's
 *  last rule is that every HP in the design doc is a sim starting value rather than a printed one. */
export function hpForAct(bossId: BossId, act: number): number {
  const boss = BOSSES[bossId];
  const keyed = boss.actHp?.[act as 1 | 2 | 3 | 4 | 5];
  return keyed ?? boss.hp;
}

/** Points handed out by a *boss* rather than earned by a character's own condition. Asmodeus is the
 *  only boss in the box that pays anybody, and both payouts are part of his bargain — the score
 *  breakdown needs a name for them or it prints a raw id next to real scoring conditions. */
export const BOSS_SCORE_LABELS: Record<string, { th: string; en: string }> = {
  asmodeusKiss: { th: '💋 จุมพิตของ Asmodeus — ถูกเลือกเป็นคนโปรด', en: "💋 Asmodeus's Kiss — singled out as his favourite" },
  asmodeusFame: { th: '👑 รับข้อเสนอ "ชื่อเสียง"', en: '👑 Took the Fame offer' },
};
