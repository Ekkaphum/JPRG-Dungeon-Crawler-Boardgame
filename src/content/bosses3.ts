// v0.3.0 "clock" ruleset — boss data. Source of truth: ../../GAME_DESIGN_v0_3_0.md §9.
// Locked to the 4-player HP column (v0.3.0 is 4-players-only, see §12 ข้อ 2).
// Move targeting/special logic (Rage, sleep-tax, armor-break) lives in src/engine/clock/bossAI.ts
// — this file only holds the display data + numeric baselines from the doc's tables.

export type BossId = 'Ragorath' | 'Somnivar' | 'Aurelius';
export const BOSS_IDS: BossId[] = ['Ragorath', 'Somnivar', 'Aurelius'];

export interface BossMoveDef {
  key: 'A' | 'B' | 'C';
  diceRange: [number, number]; // inclusive d6 range
  name: { th: string; en: string };
  time: number;
  desc: { th: string; en: string };
}

export interface BossDef {
  id: BossId;
  name: { th: string; en: string };
  sin: { th: string; en: string };
  hp: number;
  startSlot: number;
  armor: number;
  moves: [BossMoveDef, BossMoveDef, BossMoveDef];
}

export const BOSSES: Record<BossId, BossDef> = {
  Ragorath: {
    id: 'Ragorath',
    name: { th: 'Ragorath, the Bloodhorn', en: 'Ragorath, the Bloodhorn' },
    sin: { th: 'โทสะ', en: 'Wrath' },
    hp: 76,
    startSlot: 22,
    armor: 0,
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'เขาเสยฟ้า', en: 'Skyward Gore' },
        time: 4,
        desc: { th: 'ตีผู้เล่นที่หมากอยู่สูงสุดบนนาฬิกา · dmg 6 + Rage', en: 'Hits the player at the highest clock slot · dmg 6 + Rage' },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'กระทืบพื้น', en: 'Ground Stomp' },
        time: 5,
        desc: { th: 'ตีทุกคน · dmg 4 + Rage', en: 'Hits everyone · dmg 4 + Rage' },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'บ้าคลั่ง', en: 'Frenzy' },
        time: 3,
        desc: { th: 'ตีผู้เล่น HP ต่ำสุด · dmg 10 + Rage', en: 'Hits the lowest-HP player · dmg 10 + Rage' },
      },
    ],
  },
  Somnivar: {
    id: 'Somnivar',
    name: { th: 'Somnivar, the Eternal Sleeper', en: 'Somnivar, the Eternal Sleeper' },
    sin: { th: 'เกียจคร้าน', en: 'Sloth' },
    hp: 80,
    startSlot: 22,
    armor: 0,
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'ลมหายใจง่วงงุน', en: 'Drowsy Breath' },
        time: 4,
        desc: { th: 'ตีทุกคน dmg 4 · ผู้เล่นทุกคนเดินหมากลงเพิ่ม 1 ช่อง', en: 'Hits everyone for 4 · every player pawn slides down 1 more slot' },
      },
      {
        key: 'B',
        diceRange: [4, 5],
        name: { th: 'ฝันร้าย', en: 'Nightmare' },
        time: 5,
        desc: { th: 'ตีผู้เล่น 2 คนที่หมากอยู่ต่ำสุด · dmg 11', en: 'Hits the 2 players at the lowest clock slots · dmg 11' },
      },
      {
        key: 'C',
        diceRange: [6, 6],
        name: { th: 'หลับใหลนิรันดร์', en: 'Eternal Slumber' },
        time: 8,
        desc: { th: 'ไม่ทำดาเมจ · เลื่อนหมากผู้เล่นทุกคนลง 4 ช่อง', en: 'No damage · every player pawn slides down 4 slots' },
      },
    ],
  },
  Aurelius: {
    id: 'Aurelius',
    name: { th: 'Aurelius, the Crowned Colossus', en: 'Aurelius, the Crowned Colossus' },
    sin: { th: 'อหังการ', en: 'Pride' },
    hp: 88,
    startSlot: 22,
    armor: 2,
    moves: [
      {
        key: 'A',
        diceRange: [1, 3],
        name: { th: 'กระบวนแห่', en: 'Procession' },
        time: 5,
        desc: { th: 'ตีผู้เล่นที่มีคะแนนเปิดหน้าโต๊ะมากที่สุด · dmg 12', en: "Hits the player with the highest revealed score · dmg 12" },
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
        time: 7,
        desc: {
          th: 'ตีทุกคน dmg 7 · ใครที่ HP ต่ำกว่าครึ่งรับ 14 แทน',
          en: 'Hits everyone for 7 · anyone below half HP takes 14 instead',
        },
      },
    ],
  },
};

export function rollBossMove(bossId: BossId, d6: number): BossMoveDef {
  const boss = BOSSES[bossId];
  return boss.moves.find((m) => d6 >= m.diceRange[0] && d6 <= m.diceRange[1])!;
}
