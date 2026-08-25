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

// ───────────────────────── version policy ─────────────────────────
//
// Two numbers used to drift apart here, and the drift is structural rather than careless:
// `package.json` counts **releases** (it moved 8 times for UI-only work — the action-card grid,
// the battle-stage sizing, the effect timing) while a ruleset label counts **rules changes** (4
// times). One number cannot equal the other while they are counting different events. It was
// hand-synced once, at 1cad204, by moving `package.json` *backwards* from 0.4.6 to 0.4.2 — which
// threw away four release numbers and drifted again two commits later.
//
// The fix is to stop typing the number twice rather than to keep re-syncing it:
//
//   * `APP_VERSION` below is read straight out of package.json. It is the only version string
//     anybody edits, and bumping it is what "making a release" means.
//   * The ruleset **currently under development** takes its label from it automatically, so that
//     one can never disagree with the app again. Every label then names exactly one build,
//     which is what BALANCE_NOTES.md needs when it cites a measurement.
//   * A ruleset that is **finished** freezes its label and keeps it forever. v0.3.17 is the
//     tuned, released game; v0.4.5 is the name its 1,500-game balance run was published under.
//     Neither may move, and neither is allowed to be ahead of the app.
//
// tests/version.test.ts enforces all of that, so the next drift fails the build instead of being
// discovered months later.

import pkgJson from '../../package.json';

/** The single hand-edited version number in the project. */
export const APP_VERSION: string = pkgJson.version;

// Ids are permanent keys, not versions. They are written into every save file, so renaming one
// breaks saves (see the migration in session/persistence.ts) — which is exactly why the newest
// one is named for what it *is* rather than for the version it happened to ship at. `v0.3` and
// `v0.4` keep their version-shaped names only because saves in the wild already contain them.
export type RulesetVersion = 'v0.3' | 'v0.4' | 'fracture' | 'bosses';

/** The ruleset still being worked on — the one whose label tracks APP_VERSION. */
export const LIVE_RULESET: RulesetVersion = 'bosses';

/** The one the game plays by default and the only one considered finished. */
export const STABLE_RULESET: RulesetVersion = 'v0.3';

/** What the setup screen actually offers, in the order it offers it.
 *
 *  `v0.4` is deliberately absent. It is not deleted — it is a permanent save key, and a game saved
 *  under it must still load and still play by its own rules — but it has nothing left to offer a
 *  player choosing: `fracture` is v0.4.5 plus a strictly additive rule, so anyone who would have
 *  picked v0.4.5 is better served by v0.4.9, and a picker with two un-tuned variants of the same
 *  roster asks the table to understand a distinction that only ever mattered while the fractures
 *  were being measured. Same shape as SELECTABLE_VISUAL_MODES in @session/persistence: frozen out
 *  of the menu rather than removed from the code. */
export const SELECTABLE_RULESETS: RulesetVersion[] = ['v0.3', 'fracture', 'bosses'];

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
    // Frozen: this ruleset is finished and its numbers are the ones the game shipped on.
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
    // v0.4.2, not v0.4.1: 9e199fd already shipped under "v0.4.1" (the unclickable-card fix), and
    // 2a6ca31 reused the number for a far larger change — the whole camp. Two different rulesets
    // answering to one label is unusable for anything that has to reference a version later, so the
    // camp round takes the next number and the fix keeps the one it shipped with.
    // v0.4.5 folds in the character rework (Eric/Kit/Liora/Luna re-cut for the experimental track).
    // Frozen at the name its 1,500-game balance run was published under (BALANCE_NOTES.md).
    label: 'v0.4.5',
    experimental: true,
    name: { th: 'ทดลอง', en: 'Experimental' },
    // Split deliberately into "measured" and "unmeasured" rather than the blanket "not balance-
    // tested" this said before v0.4.5. The four core characters now have 1,500 hard games behind
    // them and land within 1.2 points of each other; Chrono/Kage/Morvane still have none, because
    // the sim cannot price sand, shadow, souls, stealth or a marker rewind at all. Telling a player
    // both halves are untested is as wrong as telling them both are tuned.
    desc: {
      th: 'รื้อสกิล 4 ตัวหลักใหม่ทั้งชุด · ตัวละครใหม่ 3 ตัว (เฉพาะผู้เล่นจริง) · สถานะผิดปกติจากท่าบอส · ค่ายพักระหว่างบอส',
      en: 'The four core characters re-cut, plus 3 new characters (human seats only), boss-inflicted ailments, and a camp between bosses.',
    },
    highlights: [
      { th: '⚔️ Eric — Slash/Power Strike แรงขึ้น · Power Strike เสีย HP ตัวเอง 1 ทุกครั้ง · Berserk เข้าที่ต่ำกว่าครึ่งของ HP สูงสุด', en: '⚔️ Eric — Slash and Power Strike hit harder; Power Strike costs 1 of his own HP a swing; Berserk now triggers below half max HP' },
      { th: '🎯 Kit — Sighting Shot เก็บ Focus · จ่าย Focus บวกแต้มเต๋าของ Sharp Shooting / Trap! ได้', en: '🎯 Kit — Sighting Shot banks Focus; spend it to raise the d6 on Sharp Shooting or Trap!' },
      { th: '❄️ Liora — Mana Drain ตีพร้อมเก็บมานา · Freeze ทำบอสช้า · Aura Shield ให้เกราะเพื่อนได้', en: '❄️ Liora — Mana Drain deals damage and banks mana; Freeze can Slow the boss; Aura Shield can be cast on anyone' },
      { th: '✨ Luna — เดินด้วยมานา: Holy Smite ทะลุเกราะ · Praying เติมมานา · Heal จ่ายมานา · ตีบอสแรงๆ ได้มานาคืน', en: '✨ Luna — runs on mana: Holy Smite ignores armor, Praying refills, Heal costs mana, and heavy hits on the boss tithe it back' },
      { th: 'Chrono · Kage · Morvane — บอทเลือกไม่ได้ · ท่าบอสติดสถานะผิดปกติ · บอสมีเผ่า/ธาตุ/ขนาด', en: 'Chrono · Kage · Morvane — bots cannot draft them · boss moves inflict ailments · bosses gain race, element, size' },
      { th: 'ค่ายพักระหว่างบอส — ได้เจม ซื้อไอเทม อัปสกิล หรือแลกเป็นแต้ม · ไอเทมใช้ฟรี ไม่เสีย ⏱ · เจมไม่ทบข้ามค่าย', en: 'A camp between bosses — gems, items, skill upgrades or points · items are a free action, no ⏱ · gems never carry over' },
      { th: '📊 4 ตัวหลักผ่าน sim แล้ว (1,500 เกม hard — คะแนนห่างกันไม่เกิน 1.2) · 3 ตัวใหม่ยังไม่เคยวัด', en: '📊 The four core characters are sim-measured (1,500 hard games, within 1.2 points of each other); the 3 new ones are not' },
    ],
  },
  fracture: {
    id: 'fracture',
    // Frozen: this ruleset is finished. It was the one under development while the fracture lines
    // were being measured, so its label tracked APP_VERSION; the boss series took over that role at
    // v0.4.10 and this one keeps the number it shipped and was measured under.
    label: 'v0.4.9',
    experimental: true,
    name: { th: 'ทดลอง + รอยแตก', en: 'Experimental + Fractures' },
    desc: {
      th: 'ทุกอย่างของ v0.4.5 บวกรอยแตกบนหลอดเลือดบอส 2 เส้น — ใครตีผ่านเส้นได้รางวัล',
      en: 'Everything in v0.4.5, plus two fracture lines on the boss HP track that pay whoever crosses them.',
    },
    highlights: [
      {
        th: '💥 รอยแตก 2 เส้นที่ 60% และ 30% ของ HP บอส — เปิดไอเทมรางวัลให้ดูตั้งแต่ต้นยก',
        en: '💥 Two fracture lines at 60% and 30% of boss HP — the bounty item for each is revealed at the start of the battle.',
      },
      {
        th: 'หมัดที่ทำให้ HP บอสถึงหรือต่ำกว่าเส้น = คนตีได้ไอเทมใบนั้น หรือเลือกรับเจมแทน (= ราคาไอเทม −1)',
        en: 'The hit that brings boss HP to or below a line pays its owner that item — or gems instead, worth its shop price minus 1.',
      },
      {
        th: 'รับรางวัลตอนถูกเยี่ยมครั้งถัดไป · ใช้ไอเทมต่อในตาเดียวกันได้เลย · เส้นที่ข้ามแล้วไม่กลับมาอีกแม้บอสจะฟื้นเลือด',
        en: 'Claimed on your next visit and usable in that same visit; a crossed line never re-arms, even if the boss heals back over it.',
      },
      {
        th: '📊 แยกออกมาเป็นชุดกติกาของตัวเอง เพื่อให้วัดผลเทียบกับ v0.4.5 ได้ตรงๆ · ยังไม่ผ่านการจูน',
        en: '📊 Split out as its own ruleset purely so it can be measured against v0.4.5 directly. Not tuned.',
      },
    ],
  },
  bosses: {
    id: 'bosses',
    // Derived, never typed: this is the ruleset under development, so its label *is* the app
    // version. Bumping package.json is the only edit a release needs.
    label: `v${APP_VERSION}`,
    experimental: true,
    name: { th: 'ทดลอง + บอส 12 ตัว', en: 'Experimental + 12 Bosses' },
    desc: {
      th: 'ทุกอย่างของ v0.4.9 บวกบอสอีก 9 ตัว (ปีศาจแห่งบาป 7 ครบชุด + ตัวหมากรุก) และหมวดการเล่นแบบ 5 ยก',
      en: 'Everything in v0.4.9, plus nine more bosses — the complete Seven Deadly Sins and the Chess Pieces — and the five-boss run modes.',
    },
    highlights: [
      {
        th: '😈 บาป 7 ครบชุด — Levithar (ริษยา) · Gulvorax (ตะกละ) · Mammorax (โลภ) · Asmodeus (ราคะ) เพิ่มจากสามตัวเดิม',
        en: '😈 The Seven Deadly Sins completed — Levithar (Envy), Gulvorax (Gluttony), Mammorax (Greed) and Asmodeus (Lust) join the original three.',
      },
      {
        th: '♟️ ตัวหมากรุก 5 ตัว — บอสเดินตามกฎการเดินของตัวเอง การเคลื่อนที่คืออาวุธ ไม่ใช่คูลดาวน์ · หยุดทับหมากคุณ = โดนกิน',
        en: '♟️ Five chess pieces — each moves by its own rule, so movement is the weapon rather than a cooldown. A piece that stops on your slot captures you.',
      },
      {
        th: '👑 ไฟนอลสองเฟส — Aurelius ถอดมงกุฎ และราชินีที่กลายเป็นราชา ซึ่งชนะได้ด้วยการล้อม ไม่ใช่ดาเมจ',
        en: '👑 Two-phase finales — Aurelius uncrowned, and a Queen who becomes a King you beat by surrounding him rather than by damage.',
      },
      {
        th: '🎲 หมวดการเล่น 3 แบบ: พื้นฐาน (3 ตัว) · 5 Boss (สุ่ม 5 จาก 7 บาป) · Free (เลือกเอง 5 ตัวจากทุกซีรีย์)',
        en: '🎲 Three run modes: Standard (the tuned three), 5 Boss (five of the seven sins at random), and Free (any five from either series).',
      },
      {
        th: '📊 แยกจาก v0.4.9 เพื่อให้วัดผลเทียบกันได้ตรงๆ · บอสใหม่จูนด้วย sim แล้วบางส่วน แต่ยังไม่ผ่านการวัดเต็มรูปแบบ',
        en: '📊 Split from v0.4.9 so the two can be measured against each other directly. The new bosses are partly sim-tuned and not fully measured.',
      },
    ],
  },
};

export function rulesetDef(v: RulesetVersion): RulesetDef {
  return RULESETS[v];
}

/** Whether this ruleset runs the v0.4.0 additions. A single predicate rather than scattered
 *  `=== 'v0.4'` checks, so adding a later ruleset that keeps them is a one-line change. */
export function hasV040Content(v: RulesetVersion): boolean {
  return v !== 'v0.3';
}

/** Whether this ruleset runs the camp between battles. Folded into v0.4.0 rather than living in a
 *  ruleset of its own: v0.4 was already the experimental, un-tuned track, and a third option in the
 *  picker would have asked players to understand a distinction that only mattered while the camp was
 *  being built. Kept as a predicate rather than an inline `=== 'v0.4'` so a later ruleset that drops
 *  the camp is a one-line change. */
export function hasCamp(v: RulesetVersion): boolean {
  return v !== 'v0.3';
}

/** Whether this ruleset runs the v0.4.5 character rework — Eric's Guard/survival scoring, Kit's
 *  Focus economy, Liora's Freeze/Aura Shield kit, and Luna's mana-fuelled cleric.
 *
 *  Deliberately NOT a third RulesetVersion. v0.4 was already the experimental, un-tuned track and
 *  this belongs on it; a third entry in the picker would ask players to choose between two un-tuned
 *  variants of the same roster. Keeping the union at two members also means every
 *  `Record<RulesetVersion, …>` stays exhaustive with no churn — and, critically, that the stable
 *  v0.3 ruleset is untouched by construction: every rework read site goes through this predicate,
 *  so there is no path by which a v0.3 game can see any of it. */
export function hasV045Content(v: RulesetVersion): boolean {
  return v !== 'v0.3';
}

/** Whether this ruleset runs the v0.4.6 fracture lines — two marks on the boss's HP track that
 *  pay a bounty to whoever's damage takes the boss past them.
 *
 *  This one IS a third RulesetVersion, unlike the camp and the v0.4.5 rework which were both
 *  folded onto v0.4. The reason is measurement, not taste: v0.4 has 1,500 hard games behind its
 *  four core characters, and a bounty that hands out items mid-battle moves every one of those
 *  numbers. Folded in, there would be no un-fractured build left to compare against and the only
 *  claim anyone could make about the feature would be 'it feels fine'. Kept separate, the sim can
 *  run v0.4 and fracture side by side — they differ by exactly this rule — and attribute the delta.
 *
 *  It also keeps v0.4's RNG stream untouched: the fracture draw pulls two cards off the item deck
 *  at the top of every battle, which would shift every roll after it. A v0.4 game plays out today
 *  exactly as it did before this file changed. */
export function hasFractures(v: RulesetVersion): boolean {
  return v === 'fracture' || v === 'bosses';
}

/** Whether this ruleset ships the other nine bosses and the five-boss run modes
 *  (docs/BOSS_SERIES_DESIGN.md §3-§4).
 *
 *  Its own ruleset for exactly the reason the fractures were: v0.4.9 is the build the fracture
 *  measurement was published under, and twelve bosses across three run structures moves every number
 *  in it. Folded in, there would be no un-extended build left to compare against. Kept separate,
 *  the two differ by precisely this content and the sim can attribute the delta.
 *
 *  It gates the *mode picker*, not the boss data: `bossQueue` is an array and always was, so a game
 *  handed a five-boss queue by any other route still plays it. What this predicate decides is
 *  whether the table is offered the choice — which is the whole point of it being a separate
 *  option rather than a silent addition to v0.4.9. */
export function hasBossSeries(v: RulesetVersion): boolean {
  return v === 'bosses';
}
