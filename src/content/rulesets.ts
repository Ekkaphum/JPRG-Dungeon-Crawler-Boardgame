// Ruleset versions — which set of rules a given game is played under.
//
// Everything the game shipped up to v0.3.17 is one ruleset and stays the default. v0.4.0 is a
// separate, opt-in ruleset that adds the three human-only characters, boss ailments, and the boss
// axis data. It is explicitly NOT the official playable version: it has never been through a
// balance sim (the sim prices skills by damage-per-⏱ and cannot see sand, shadow, souls, stealth or
// a marker rewind at all — docs/EXPANSION_DESIGN.md §4.2), so anything it reports about the new
// characters would measure the bot's blind spot rather than the design.
//
// The flag lives on GameState rather than being read from settings at the point of use, so a saved
// game keeps the ruleset it was started under even if the menu selection changes afterwards.

export type RulesetVersion = 'v0.3' | 'v0.4' | 'v0.5';

/** The one the game plays by default and the only one considered finished. */
export const STABLE_RULESET: RulesetVersion = 'v0.3';

export interface RulesetDef {
  id: RulesetVersion;
  /** Shown next to the play button so it is always obvious what is about to launch. */
  label: string;
  /** True for anything not considered release-ready. Drives the warning styling in the picker. */
  experimental: boolean;
  name: { th: string; en: string };
  desc: { th: string; en: string };
  /** One-line summary of what is different, listed under the option in the picker. */
  highlights: { th: string; en: string }[];
}

export const RULESETS: Record<RulesetVersion, RulesetDef> = {
  'v0.3': {
    id: 'v0.3',
    label: 'v0.3.17',
    experimental: false,
    name: { th: 'มาตรฐาน', en: 'Standard' },
    desc: {
      th: 'กติกาที่จูนสมดุลมาแล้วจริง — 4 ตัวละคร บอส 3 ตัว ไม่มีสถานะผิดปกติ',
      en: 'The balanced, tuned ruleset — 4 characters, 3 bosses, no status ailments.',
    },
    highlights: [
      { th: 'ผ่านการวัดสมดุลด้วยการจำลอง 5,000 เกมต่อระดับ', en: 'Balance-tested across 5,000 simulated games per tier' },
      { th: 'Eric · Kit · Liora · Luna', en: 'Eric · Kit · Liora · Luna' },
    ],
  },
  'v0.4': {
    id: 'v0.4',
    label: 'v0.4.0',
    experimental: true,
    name: { th: 'ทดลอง', en: 'Experimental' },
    desc: {
      th: 'เพิ่มตัวละครใหม่ 3 ตัว (เล่นได้เฉพาะผู้เล่นจริง) และสถานะผิดปกติจากท่าบอส — ยังไม่ผ่านการวัดสมดุล',
      en: 'Adds 3 new characters (human seats only) and boss-inflicted ailments. Not balance-tested.',
    },
    highlights: [
      { th: 'Chrono · Kage · Morvane — บอทเลือกไม่ได้', en: 'Chrono · Kage · Morvane — bots cannot draft them' },
      { th: 'ท่าบอสติดสถานะผิดปกติ · บอสมีเผ่า/ธาตุ/ขนาด', en: 'Boss moves inflict ailments; bosses gain race, element, size' },
      { th: '⚠️ ตัวเลขทั้งหมดเป็นการเดา ยังไม่ผ่าน sim', en: '⚠️ Every number is a first guess — no sim has run on it' },
    ],
  },
  'v0.5': {
    id: 'v0.5',
    label: 'v0.5.0',
    experimental: true,
    name: { th: 'ค่ายพัก', en: 'Camp' },
    desc: {
      th: 'ทุกอย่างของ v0.4.0 บวกช่วงพักระหว่างบอส — ได้เจม ซื้อไอเทม อัปสกิล หรือแลกเป็นแต้ม',
      en: 'Everything in v0.4.0 plus a camp between bosses — earn gems, buy items, upgrade skills, or convert to points.',
    },
    highlights: [
      { th: 'เจมจากการปราบบอส 8/10/12 + เวลาที่เหลือหาร 2', en: 'Gems per boss 8/10/12, plus leftover slots ÷ 2' },
      { th: 'ตลาดไอเทม 4 ใบ + future market 1 ใบ', en: 'A 4-card market with a 1-card future row' },
      { th: 'ไอเทมใช้เป็น free action ในตาตัวเอง ไม่เสีย ⏱', en: 'Items are a free action on your own visit — no ⏱ cost' },
      { th: '⚠️ เจมไม่ทบข้ามค่าย — ใช้ให้หมดในค่ายนั้น', en: '⚠️ Gems do not carry between camps — spend them or lose them' },
    ],
  },
};

export function rulesetDef(v: RulesetVersion): RulesetDef {
  return RULESETS[v];
}

/** Whether this ruleset runs the v0.4.0 additions. A single predicate rather than scattered
 *  `=== 'v0.4'` checks, so adding a later ruleset that keeps them is a one-line change. */
export function hasV040Content(v: RulesetVersion): boolean {
  return v === 'v0.4' || v === 'v0.5';
}

/** Whether this ruleset runs the camp between battles. v0.5 layers on top of v0.4.0 rather than
 *  replacing it, so a camp game also gets the ailments and the expanded roster. */
export function hasCamp(v: RulesetVersion): boolean {
  return v === 'v0.5';
}
