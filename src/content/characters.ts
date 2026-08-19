// v0.3.0 "clock" ruleset — character + skill data. Source of truth: ../../GAME_DESIGN_v0_3_0.md §8.
// Lv2 numbers are NOT in the source doc — see docs/10-v0.3.0-rulings.md §1 for the extrapolation
// rule (~35-50% power bump) used to fill them in so the EXP/level system has real weight.

// Dax and Mira were removed entirely in v0.4.0. They had been disabled since 2026-08-12 (out of
// CHAR_IDS but still fully implemented) and never came back: Mira failed the §8.0 role template
// outright — her slot ③ was `buffMana` with numbers identical to Liora's ManaCharge, so she had no
// signature of her own — and the sim independently flagged her as the roster's outlier at 0.99
// pts/win against everyone else's 5-8. Keeping two half-alive characters in every Record<CharId,…>
// and every test fixture cost more than they were worth, and v0.4.0's three new characters occupy
// the design space they were holding.
export type CharId = 'Eric' | 'Kit' | 'Liora' | 'Luna' | 'Chronos' | 'Kage' | 'Morvane';

/** The v0.3.x roster — the only characters bots ever play, and the whole pool in the stable
 *  ruleset. v0.4.0's three additions are human-only; see V040_CHAR_IDS. */
export const CHAR_IDS: CharId[] = ['Eric', 'Kit', 'Liora', 'Luna'];

/** v0.4.0 (experimental): human-only additions. Bots have no heuristics for their resources —
 *  `estimateChoiceValue` prices skills by damage-per-⏱ and cannot see sand, shadow, souls, or a
 *  marker rewind at all — so letting a bot draft one would measure the bot's blind spot rather
 *  than the character. Gated behind the v0.4.0 ruleset AND behind being a human seat. */
export const V040_CHAR_IDS: CharId[] = ['Chronos', 'Kage', 'Morvane'];

/** Every CharId that exists — for Record<CharId,…> exhaustiveness and tests. Never the draft
 *  pool; use charPool() for that. */
export const ALL_CHAR_IDS: CharId[] = [...CHAR_IDS, ...V040_CHAR_IDS];

export type SkillId =
  // Eric
  | 'Slash'
  | 'PowerStrike'
  | 'Guard'
  | 'CounterAttack'
  // Kit
  | 'QuickShot'
  | 'SharpShooting'
  | 'Trap'
  | 'MultiShot'
  // Liora
  | 'AirPush'
  | 'Fireball'
  | 'AuraCharge'
  | 'Meteor'
  // Luna
  | 'Hitting'
  | 'AuraSmite'
  | 'Blessing'
  | 'Heal'
  // Chronos (v0.4.0)
  | 'Tick'
  | 'HourglassShard'
  | 'Haste'
  | 'Rewind'
  // Kage (v0.4.0)
  | 'Shuriken'
  | 'TwinFang'
  | 'SmokeBomb'
  | 'Assassinate'
  // Morvane (v0.4.0)
  | 'Drain'
  | 'SoulSiphon'
  | 'RaiseDead'
  | 'DeathCoil';

/** Which resolution family a skill belongs to — see docs/RULINGS.md §5. */
export type SkillKind =
  | 'attack' // Slash, Power Strike, Quick Shot, Air Push, Hitting, Aura Smite, Tick, Shuriken, Twin Fang, Drain, Soul Siphon — plain damage to boss
  | 'attackGated' // (unused — Eric's HP-gated damage is the always-on Berserk passive instead of a per-skill tier)
  | 'attackRoll' // Sharp Shooting — attack + dice roll → weak point buff
  | 'attackMana' // Fireball, Meteor — attack scaled by mana paid
  | 'multiHit' // Multi Shot — one hit at resolve + extra hits scheduled at earlier slots (see earlyHits)
  | 'heal' // Heal — targeted heal, resolves next visit
  | 'buffCounter' // Counter Attack — immediate self-shield + conditional counter-strike
  | 'buffParty' // Blessing — immediate party-wide atk/defense buff
  | 'buffMana' // Aura Charge — immediate self-shield; Liora's mana gain comes from her ManaCharge passive, not this
  | 'guard' // Guard — immediate damage-redirect link from an ally onto the caster
  | 'trap' // Trap! — immediate token placement
  // ── v0.4.0 ── one new kind per new character's slot ②, per §8.0's rule that no two characters'
  // support cards may share a SkillKind.
  | 'buffHaste' // Haste (Chronos) — immediate: drags an ally's pawn back up the clock so they act sooner
  | 'buffStealth' // Smoke Bomb (Kage) — immediate: hides everyone sharing the caster's slot
  | 'raise' // Raise Dead (Morvane) — immediate: revives a downed ally now instead of on their revive slot
  | 'rewind'; // Rewind (Chronos ③) — immediate: walks the *clock marker itself* back up

export interface SkillLevelStats {
  time: number;
  /** Meaning depends on the skill: flat damage, heal amount, trap damage, dmg reduction, etc. */
  primary?: number;
  /** Also overloaded per kind: hit count (attack), damage per mana (attackMana), riposte damage
   *  (buffCounter), and — for `attackGated` — the *boosted* damage used while the gate holds. */
  secondary?: number;
  /** Dice-ladder starting target for attackRoll/trap kinds (5 normally, 4 at Lv2 — 6/5 for Trap!). */
  rollBaseTarget?: number;
  /** multiHit only — extra hits scheduled `offset` slots before the caster's own landing slot,
   *  fired unconditionally (no roll, no boss-position check) when the clock marker reaches them. The
   *  skill's own `primary` damage still lands normally at resolve (marker - time), so a 3-hit skill
   *  needs exactly 2 entries here. */
  earlyHits?: { offset: number; dmg: number }[];
}

export interface SkillDef {
  id: SkillId;
  charId: CharId;
  kind: SkillKind;
  name: { th: string; en: string };
  /** Damage from this skill skips the boss's armor entirely — Smite/Aura Smite and Trap!/Set Trap
   *  (the latter hardcoded separately in skills.ts's trap-kind resolution, not read from here). */
  ignoresArmor?: boolean;
  /** v0.4.1: an `attack`/`attackRoll`-kind skill marked `immediate` deals its damage (and rolls its
   *  weak-point check, if any) the instant it's declared, instead of waiting for the caster's next
   *  visit — skills.ts's declareSkill() resolves it right there and flags the pending action as
   *  already resolved. The pawn still walks its full ⏱ exactly as before; only *when the damage
   *  lands* changes. UI shows a ⚡ badge on these — see PASSIVES-adjacent skill cards in
   *  DecisionPanel.tsx/HeroDetailModal.tsx. Reserved for fast, simple hits (the common attacks, Power
   *  Strike, Sharp Shooting, Aura Smite) — charged/scaling attacks (Fireball, Meteor) and multi-slot
   *  ones (Multi Shot) stay resolve-delayed. */
  immediate?: boolean;
  lv1: SkillLevelStats;
  lv2: SkillLevelStats;
}

export type PassiveId =
  | 'Berserk'
  | 'SkillImprovement'
  | 'ManaCharge'
  | 'HolyWater'
  // v0.4.0
  | 'TimeSpiral'
  | 'Shadowless'
  | 'UndeadPact';

export interface PassiveDef {
  id: PassiveId;
  charId: CharId;
  name: { th: string; en: string };
  desc: { th: string; en: string };
}

/** Always-on character traits — never declared, never leveled with EXP (there's no card to put
 *  tokens on), just true for as long as the character is alive. Engine hooks for these live where
 *  the mechanic naturally sits (damage.ts for Berserk, skills.ts for the roll-penalty and mana
 *  passives) rather than through a generic dispatch table — four one-off effects don't earn one. */
export const PASSIVES: Partial<Record<CharId, PassiveDef>> = {
  Eric: {
    id: 'Berserk',
    charId: 'Eric',
    name: { th: 'Berserk', en: 'Berserk' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: ขณะ HP ต่ำกว่า 7 พลังโจมตีของ Eric ทุกครั้ง +4 (เช็คในเวลาที่การโจมตีเกิดผล; สกิล ⚡ จึงเช็คตอนประกาศ)',
      en: "Always active: while Eric's HP is below 7, every attack deals +4 (checked when the hit takes effect, so ⚡ skills check on declare).",
    },
  },
  Kit: {
    id: 'SkillImprovement',
    charId: 'Kit',
    name: { th: 'Skill Improvement', en: 'Skill Improvement' },
    desc: {
      th: 'ทุกครั้งที่ Sharp Shooting หรือ Trap! ทอยไม่สำเร็จ เกณฑ์ของสกิลที่พลาดจะลดลง 1 แต้มแยกกัน สะสมข้ามยกบอสจนต่ำสุด 2 — การพลาดของใบหนึ่งไม่อัพเกรดอีกใบ',
      en: "Every failed Sharp Shooting or Trap! roll permanently lowers only that skill's target by 1, tracked separately across boss fights down to a floor of 2.",
    },
  },
  Liora: {
    id: 'ManaCharge',
    charId: 'Liora',
    name: { th: 'ManaCharge', en: 'ManaCharge' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: ทุกครั้งที่ Liora ประกาศแอคชันที่ไม่สร้างดาเมจให้บอส (เช่น Aura Charge) เธอได้มานา +1 (สูงสุด 3) — Fireball/Meteor จ่ายมานานี้ได้ +3 ดาเมจต่อหน่วย',
      en: "Always active: whenever Liora declares a non-damaging action (Aura Charge), she gains +1 mana (cap 3) — Fireball/Meteor spend it for +3 damage per point.",
    },
  },
  Luna: {
    id: 'HolyWater',
    charId: 'Luna',
    name: { th: 'HolyWater', en: 'Holy Water' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: เมื่อบอสโจมตี Luna โดยตรง (ท่าเดี่ยว ไม่ใช่ AoE) สถานะผิดปกติที่ท่านั้นจะติดให้เธอถูกยกเลิกทันที — ยังไม่มีท่าบอสใดในเนื้อหาปัจจุบันที่ติดสถานะผิดปกติ ดังนั้นตอนนี้ยังไม่มีผลจริงในเกม แต่กลไกพร้อมรองรับบอสในอนาคต',
      en: "Always active: when the boss hits Luna with a single-target move, any debuff status it would apply to her is cancelled. v0.4.0 finally gives this something to do — the bosses now inflict real statuses.",
    },
  },
  Chronos: {
    id: 'TimeSpiral',
    charId: 'Chronos',
    name: { th: 'เกลียวเวลา', en: 'Time Spiral' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: ทุกครั้งที่ประกาศสกิลที่ใช้เวลา ⏱3 ขึ้นไป ได้เม็ดทราย +1 (สูงสุด 4) — ทรายคือค่าใช้จ่ายของ Rewind',
      en: 'Always active: every time Chronos declares a skill costing ⏱3 or more, he gains 1 sand (max 4). Sand is what Rewind spends.',
    },
  },
  Kage: {
    id: 'Shadowless',
    charId: 'Kage',
    name: { th: 'ไร้เงา', en: 'Shadowless' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: ทุกครั้งที่ถึงตาของ Kage โดยที่เขาไม่โดนบอสโจมตีเลยนับจากตาที่แล้ว ได้เงา +1 (สูงสุด 3) — เงาคือค่าใช้จ่ายของ Assassinate',
      en: 'Always active: each time Kage is visited without having been hit by the boss since his last visit, he gains 1 shadow (max 3). Shadow is what Assassinate spends.',
    },
  },
  Morvane: {
    id: 'UndeadPact',
    charId: 'Morvane',
    name: { th: 'สัญญาอันเดด', en: 'Undead Pact' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: Morvane เป็นอันเดด — **รักษาด้วย Heal ไม่ได้เลย** ต้องดูดเลือดเอาเองจาก Drain/Soul Siphon · แลกกับการได้วิญญาณ +1 ทุกครั้งที่เสีย HP 3 ขึ้นไปจากการโจมตีครั้งเดียว และทุกครั้งที่มีใครสักคนบนกระดานล้มลง',
      en: 'Always active: Morvane is undead — **healing cannot restore his HP at all**; only his own Drain and Soul Siphon can. In exchange he gains 1 soul whenever a single hit costs him 3+ HP, and 1 whenever anyone on the board goes down.',
    },
  },
};

export interface ScoreConditionDef {
  id: string;
  charId: CharId;
  slot: 1 | 2 | 3;
  points: number;
  perOccurrence: boolean;
  desc: { th: string; en: string };
}

export interface CharacterDef {
  id: CharId;
  job: { th: string; en: string };
  hp: number;
  startSlot: number;
  reviveHp: number;
  skills: SkillId[];
  score: [ScoreConditionDef, ScoreConditionDef, ScoreConditionDef];
}

export const SKILLS: Record<SkillId, SkillDef> = {
  // v0.4.0 redesign: every drafted character now gets a cheap "common attack" plus 3 real cards
  // (was a flat 3-card kit), and one always-on passive that isn't a card at all — see PASSIVES
  // above. Lv2 numbers are extrapolated with the same ~35-50% bump docs/10-v0.3.0-rulings.md §1
  // uses everywhere else in this file; only Lv1 was specified.
  Slash: {
    id: 'Slash',
    charId: 'Eric',
    kind: 'attack',
    immediate: true,
    name: { th: 'Slash', en: 'Slash' },
    lv1: { time: 2, primary: 3 },
    lv2: { time: 2, primary: 4 },
  },
  PowerStrike: {
    id: 'PowerStrike',
    charId: 'Eric',
    kind: 'attack',
    immediate: true,
    name: { th: 'Power Strike', en: 'Power Strike' },
    lv1: { time: 4, primary: 6 },
    lv2: { time: 4, primary: 9 },
  },
  Guard: {
    id: 'Guard',
    charId: 'Eric',
    kind: 'guard',
    name: { th: 'Guard', en: 'Guard' },
    // primary = flat reduction on damage redirected onto Eric. No more `secondary`/wardAtk (the
    // ward no longer gets an attack buff) — the redesign frames Guard as pure protection: Eric
    // takes the hit instead of them, full stop.
    lv1: { time: 5, primary: 4 },
    lv2: { time: 5, primary: 6 },
  },
  CounterAttack: {
    id: 'CounterAttack',
    charId: 'Eric',
    kind: 'buffCounter',
    name: { th: 'Counter Attack', en: 'Counter Attack' },
    // primary = incoming-damage reduction %, secondary = counter-strike damage
    lv1: { time: 4, primary: 50, secondary: 9 },
    lv2: { time: 4, primary: 50, secondary: 13 },
  },
  QuickShot: {
    id: 'QuickShot',
    charId: 'Kit',
    kind: 'attack',
    immediate: true,
    name: { th: 'Quick Shot', en: 'Quick Shot' },
    lv1: { time: 2, primary: 2 },
    lv2: { time: 2, primary: 3 },
  },
  SharpShooting: {
    id: 'SharpShooting',
    charId: 'Kit',
    kind: 'attackRoll',
    immediate: true,
    name: { th: 'Sharp Shooting', en: 'Sharp Shooting' },
    // On a successful roll, every player's attacks on the boss deal +4 for WEAK_POINT_SLOTS (4)
    // clock slots (skills.ts) — a fixed timer independent of the boss's own action, since v0.3.15.
    // Sets battle.weakPoint = { ownerId, expiresAtSlot }, not the old boolean weakPointActive flag.
    lv1: { time: 3, primary: 5, rollBaseTarget: 5 },
    lv2: { time: 3, primary: 7, rollBaseTarget: 4 },
  },
  Trap: {
    id: 'Trap',
    charId: 'Kit',
    kind: 'trap',
    name: { th: 'Trap!', en: 'Trap!' },
    // Armed on one of the 3 slots ahead of Kit's own pawn (legalTrapSlots derives this from `time`
    // — 4 gives exactly 3 legal slots, marker-1..marker-3). v0.3.15+: springs *inside* the boss's own
    // action — the boss rolls its move, the trap rolls to spring, and a passed roll deals `primary`
    // damage (ignores armor) and cancels that move outright; the boss still pays the move's full ⏱
    // as cooldown, so a sprung trap costs it the entire turn (springTrapOnBoss, skills.ts).
    // Lv1 rollBaseTarget 6 -> 5 (v0.3.8), Lv2 deliberately left at 5. The roll stays the gate on
    // purpose — cancelling the boss's entire move is the single most powerful party-wide effect in
    // the ruleset, so it must not become reliable. Declares recovered to ~0.22/game (670/3,000 games)
    // once kit2 was restored as "Trap triggers" at 2 points (v0.3.16) and the cancel itself started
    // reading as worth the ⏱4 commitment — see docs/BALANCE_NOTES.md for the pre-restore numbers.
    lv1: { time: 4, primary: 5, rollBaseTarget: 5 },
    lv2: { time: 4, primary: 7, rollBaseTarget: 5 },
  },
  MultiShot: {
    id: 'MultiShot',
    charId: 'Kit',
    kind: 'multiHit',
    name: { th: 'Multi Shot', en: 'Multi Shot' },
    // primary = the hit that lands at normal resolve (marker - time). earlyHits fire unconditionally
    // at marker - offset, no roll needed — 2 dmg 2 slots out, 3 dmg 3 slots out, then the 4-dmg
    // primary hit itself lands 4 slots out (= time), for 3 total hits across the ⏱4 window.
    lv1: { time: 4, primary: 4, earlyHits: [{ offset: 2, dmg: 2 }, { offset: 3, dmg: 3 }] },
    lv2: { time: 4, primary: 6, earlyHits: [{ offset: 2, dmg: 3 }, { offset: 3, dmg: 5 }] },
  },
  AirPush: {
    id: 'AirPush',
    charId: 'Liora',
    kind: 'attack',
    immediate: true,
    name: { th: 'Air Push', en: 'Air Push' },
    lv1: { time: 2, primary: 2 },
    lv2: { time: 2, primary: 3 },
  },
  Fireball: {
    id: 'Fireball',
    charId: 'Liora',
    kind: 'attackMana',
    name: { th: 'Fireball', en: 'Fireball' },
    // primary = base damage, secondary = damage per mana point. Mana itself comes from Liora's
    // ManaCharge passive (see PASSIVES), not from anything Fireball does.
    lv1: { time: 3, primary: 5, secondary: 3 },
    lv2: { time: 3, primary: 8, secondary: 3 },
  },
  AuraCharge: {
    id: 'AuraCharge',
    charId: 'Liora',
    kind: 'buffMana',
    name: { th: 'Aura Charge', en: 'Aura Charge' },
    // primary intentionally 0 — the mana gain is the ManaCharge *passive* firing off this
    // non-damaging declare (skills.ts), not a property of the card itself. secondary = the flat
    // "Def+3" damage reduction the card actually grants.
    lv1: { time: 2, primary: 0, secondary: 3 },
    lv2: { time: 2, primary: 0, secondary: 5 },
  },
  Meteor: {
    id: 'Meteor',
    charId: 'Liora',
    kind: 'attackMana',
    name: { th: 'Meteor', en: 'Meteor' },
    lv1: { time: 7, primary: 13, secondary: 3 },
    lv2: { time: 7, primary: 18, secondary: 3 },
  },
  Hitting: {
    id: 'Hitting',
    charId: 'Luna',
    kind: 'attack',
    immediate: true,
    name: { th: 'Hitting', en: 'Hitting' },
    lv1: { time: 2, primary: 2 },
    lv2: { time: 2, primary: 3 },
  },
  AuraSmite: {
    id: 'AuraSmite',
    charId: 'Luna',
    kind: 'attack',
    ignoresArmor: true,
    immediate: true,
    name: { th: 'Aura Smite', en: 'Aura Smite' },
    lv1: { time: 4, primary: 5 },
    lv2: { time: 4, primary: 7 },
  },
  Blessing: {
    id: 'Blessing',
    charId: 'Luna',
    kind: 'buffParty',
    name: { th: 'Blessing', en: 'Blessing' },
    // primary = party atk buff, secondary = party armor/dmg reduction (flat). The effect begins on
    // declare and lasts exactly four clock slots, independent of when Luna's pawn returns.
    lv1: { time: 4, primary: 3, secondary: 2 },
    lv2: { time: 4, primary: 4, secondary: 3 },
  },
  Heal: {
    id: 'Heal',
    charId: 'Luna',
    kind: 'heal',
    name: { th: 'Heal', en: 'Heal' },
    lv1: { time: 3, primary: 6 },
    lv2: { time: 3, primary: 9 },
  },

  // ══ v0.4.0 — Chronos, the Time Mage ══
  // His ⏱ numbers are deliberately ordinary; his speed axis is "ช้า" (slow) expressed as a ⏱6
  // signature rather than a global modifier, so nothing in the engine needs a speed multiplier.
  Tick: {
    id: 'Tick',
    charId: 'Chronos',
    kind: 'attack',
    immediate: true,
    name: { th: 'Tick', en: 'Tick' },
    lv1: { time: 2, primary: 2 },
    lv2: { time: 2, primary: 3 },
  },
  HourglassShard: {
    id: 'HourglassShard',
    charId: 'Chronos',
    kind: 'attack',
    immediate: true,
    name: { th: 'Hourglass Shard', en: 'Hourglass Shard' },
    // Inflicts 💫 daze (+1 ⏱ on the boss's next move) when it lands — the cheap, repeatable half of
    // his clock control, against Rewind's expensive one.
    lv1: { time: 3, primary: 5 },
    lv2: { time: 3, primary: 7 },
  },
  Haste: {
    id: 'Haste',
    charId: 'Chronos',
    kind: 'buffHaste',
    name: { th: 'Haste', en: 'Haste' },
    // primary = how many slots the target ally's pawn is dragged back *up* the clock (toward the
    // marker), so they are visited sooner. Touches the damage economy the way §8.0 demands without
    // dealing damage: it buys the party extra pawn-visits, and visits are where all damage happens.
    lv1: { time: 3, primary: 2 },
    lv2: { time: 3, primary: 3 },
  },
  Rewind: {
    id: 'Rewind',
    charId: 'Chronos',
    kind: 'rewind',
    name: { th: 'Rewind', en: 'Rewind' },
    // primary = slots the *marker* walks back up. The one card in the game that fights the actual
    // lose condition (marker reaches 0 with the boss alive). Safe by construction: every pawn is
    // always at or below the marker, so moving the marker up can never step over one and re-trigger
    // it. Costs SAND_PER_REWIND on top of ⏱6 — he pays 6 personal slots to hand 3 slots to all four
    // seats, which is why it reads as selfless rather than as a tempo cheat.
    lv1: { time: 6, primary: 3 },
    lv2: { time: 6, primary: 4 },
  },

  // ══ v0.4.0 — Kage, the Ninja ══
  // Speed "เร็วมาก" is baked straight into these ⏱ values (2/2/3/4 — the fastest kit in the game)
  // rather than applied as a −1 modifier, so there is no floor rule to enforce anywhere.
  Shuriken: {
    id: 'Shuriken',
    charId: 'Kage',
    kind: 'attack',
    immediate: true,
    name: { th: 'Shuriken', en: 'Shuriken' },
    lv1: { time: 2, primary: 3 },
    lv2: { time: 2, primary: 4 },
  },
  TwinFang: {
    id: 'TwinFang',
    charId: 'Kage',
    kind: 'attack',
    immediate: true,
    name: { th: 'Twin Fang', en: 'Twin Fang' },
    // secondary = hit count, same overload `attack` already uses. Two separate hits means two
    // separate weak-point/Blessing applications, and two chances to break Aurelius's armor.
    lv1: { time: 2, primary: 4, secondary: 2 },
    lv2: { time: 2, primary: 6, secondary: 2 },
  },
  SmokeBomb: {
    id: 'SmokeBomb',
    charId: 'Kage',
    kind: 'buffStealth',
    name: { th: 'Smoke Bomb', en: 'Smoke Bomb' },
    // primary = the damage bonus on the first attack each hidden fighter makes coming out of
    // stealth; secondary = how many clock slots the stealth lasts. Feeds the damage economy through
    // that bonus, and it applies to *everyone sharing Kage's slot* — which is the whole reason his
    // size is เล็ก (small): small fighters may always stack onto an occupied slot.
    lv1: { time: 3, primary: 3, secondary: 4 },
    lv2: { time: 3, primary: 5, secondary: 4 },
  },
  Assassinate: {
    id: 'Assassinate',
    charId: 'Kage',
    kind: 'attack',
    ignoresArmor: true,
    name: { th: 'Assassinate', en: 'Assassinate' },
    // Costs SHADOW_PER_ASSASSINATE. Execute bonus below ASSASSINATE_EXECUTE_THRESHOLD boss HP is
    // applied in skills.ts, not here, because it reads live boss HP.
    lv1: { time: 4, primary: 12 },
    lv2: { time: 4, primary: 16 },
  },

  // ══ v0.4.0 — Morvane, the Necromancer ══
  Drain: {
    id: 'Drain',
    charId: 'Morvane',
    kind: 'attack',
    immediate: true,
    name: { th: 'Drain', en: 'Drain' },
    // secondary is NOT a hit count here — Drain and Soul Siphon are the only two `attack`-kind
    // skills that self-heal, and skills.ts reads `lifesteal` off the SkillDef rather than off
    // stats, precisely so `secondary` keeps meaning "hit count" everywhere else.
    lv1: { time: 2, primary: 2 },
    lv2: { time: 2, primary: 3 },
  },
  SoulSiphon: {
    id: 'SoulSiphon',
    charId: 'Morvane',
    kind: 'attack',
    immediate: true,
    name: { th: 'Soul Siphon', en: 'Soul Siphon' },
    lv1: { time: 3, primary: 6 },
    lv2: { time: 3, primary: 8 },
  },
  RaiseDead: {
    id: 'RaiseDead',
    charId: 'Morvane',
    kind: 'raise',
    name: { th: 'Raise Dead', en: 'Raise Dead' },
    // primary = percent of max HP the revived ally comes back with. Feeds the damage economy the
    // most directly of any support card in the game: a downed ally is ~6 slots of missing pawn
    // visits, and this buys all of them back at once.
    lv1: { time: 4, primary: 50 },
    lv2: { time: 4, primary: 75 },
  },
  DeathCoil: {
    id: 'DeathCoil',
    charId: 'Morvane',
    kind: 'attack',
    name: { th: 'Death Coil', en: 'Death Coil' },
    // Costs SOULS_PER_DEATH_COIL. The optional HP surcharge (pay DEATH_COIL_HP_COST for
    // `secondary` damage instead of `primary`) is resolved in skills.ts.
    lv1: { time: 5, primary: 14, secondary: 20 },
    lv2: { time: 5, primary: 18, secondary: 26 },
  },
};

export const CHARACTERS: Record<CharId, CharacterDef> = {
  Eric: {
    id: 'Eric',
    job: { th: 'Knight', en: 'Knight' },
    hp: 16,
    startSlot: 23,
    reviveHp: 8,
    // v0.4.0: common attack + 3 cards, plus the always-on Berserk passive (PASSIVES.Eric).
    skills: ['Slash', 'PowerStrike', 'Guard', 'CounterAttack'],
    score: [
      {
        id: 'eric1',
        charId: 'Eric',
        slot: 1,
        points: 1,
        perOccurrence: true,
        desc: { th: 'ทำ dmg ครั้งเดียวได้มากกว่า 10', en: 'Deal more than 10 damage in one hit' },
      },
      {
        id: 'eric2',
        charId: 'Eric',
        slot: 2,
        points: 1,
        perOccurrence: true,
        // v0.3.7: was "Land the Last Shot" (3pts), which is now the universal LAST_SHOT_POINTS bonus
        // every character earns. Eric's protector role — the whole point of Guard — previously scored
        // nothing at all despite Guard being declared ~1,800 times per 3,000 sim games.
        //
        // v0.3.15: 2 pts -> 1. The v0.3.14 boss pass made the boss act roughly once more per battle,
        // and this condition pays per redirect with no cap, so its firing rate went 0.46 -> 4.36 per
        // win on its own. Measured effect: Eric took **82.3%** of individual wins (Kit 1.4%), and
        // zeroing this one condition moved him back to 23.0% — it is the single cause, not the bots'
        // fondness for Guard. Halving rather than capping keeps the condition's shape (every save
        // counts, exactly as a protector's job should read) and only repricing what a save is worth.
        desc: { th: 'ปกป้องเพื่อนสำเร็จ — Guard รับดาเมจแทนเพื่อน', en: 'Guard successfully takes a hit aimed at an ally' },
      },
      {
        id: 'eric3',
        charId: 'Eric',
        slot: 3,
        // v0.3.7: was "end the battle with HP below 5 (and alive)" — fired 0.13 times per win, i.e.
        // effectively dead, and it fought Berserk (which wants low HP *while attacking*, not at the
        // final frame). This asks about the battle's history instead: he took the beating and stayed
        // standing, which is the shonen fantasy stated as a rule.
        //
        // 3 -> 2 (v0.3.16 experiment): isolating eric2 and eric3 separately (zeroing each in turn)
        // showed eric3 drives more of Eric's individual win share than eric2 despite firing only
        // once/battle — hard win share 43.4% baseline, 18.3% with eric2=0, but only 11.2% with
        // eric3=0. The read: eric3 is low-variance income correlated with games he's already winning
        // (a frontline tank surviving is itself a signal the party is doing fine), so it swings close
        // games harder than its raw point value suggests. Cut here rather than at eric2 first.
        points: 2,
        perOccurrence: false,
        desc: {
          th: 'บาดเจ็บสาหัสแต่ไม่ล้ม — เคยลง HP ต่ำกว่าครึ่ง แต่จบยกโดยไม่เคยตาย',
          en: 'Battered but unbroken: dropped below half HP at some point, yet never died all battle',
        },
      },
    ],
  },
  Kit: {
    id: 'Kit',
    job: { th: 'Hunter', en: 'Hunter' },
    hp: 13,
    startSlot: 23,
    reviveHp: 7,
    // ① Twin Shot ② Quick Shot (its weak point is what the rest of the party spends) ③ Set Trap.
    // v0.4.0: common attack + 3 cards, plus the always-on Skill Improvement passive (PASSIVES.Kit).
    skills: ['QuickShot', 'SharpShooting', 'Trap', 'MultiShot'],
    score: [
      {
        id: 'kit1',
        charId: 'Kit',
        slot: 1,
        // v0.3.16 first cut: dropped the "opening pays" half and moved kit1 entirely onto the hits
        // that cash the window in, by anyone — Kit's own follow-up shots included. Measured too
        // costly on its own: kit1 fell from 4.18 pts/win (the old open+ally-hit split, under two ids)
        // to 2.35, because a 4-slot window rarely sees more than ~1.4 hits land, and doubling kit2
        // (Trap) afterwards couldn't make up the gap since Trap's frequency, not its point value, is
        // the bottleneck. Restored the open-pays-1 half on top of the hit-pays-1 half: opening still
        // isn't free (the party still has to actually use it, or nothing beyond that first point
        // comes in), but a wasted window no longer costs Kit the whole point of having declared it.
        points: 1,
        perOccurrence: true,
        desc: {
          th: 'เปิดจุดอ่อนสำเร็จ หรือ ใครก็ตามตีเข้าจุดอ่อนที่ Kit เปิดไว้',
          en: 'Open a weak point, or anyone lands a hit while the one Kit opened is still up',
        },
      },
      {
        id: 'kit2',
        charId: 'Kit',
        slot: 2,
        // v0.3.16: restored after v0.3.15 moved the old kit2 onto the weak point and left Trap with
        // no score condition at all — measured at 85 declares in 3,000 games with nothing paying for
        // it. Back to a plain "the roll passed", which is also the roll that cancels the boss's move
        // outright (springTrapOnBoss, skills.ts) — the single most powerful effect in the ruleset, so
        // it stays gated behind the same roll rather than getting a condition of its own to chase.
        //
        // 1 -> 2: at 1 point this measured 0.06 fires/win, next to nothing — kit1 moving off "opening
        // pays" onto "a hit has to land" cut Kit's income far more than expected (13.39 -> 11.60
        // pts/win, win share 25.6% -> 11.6% at hard), and Trap's own frequency stayed too low for a
        // single point to matter. Doubling it is the direct lever for that shortfall.
        points: 2,
        perOccurrence: true,
        desc: { th: 'กับดักทำงานสำเร็จ', en: 'Trap successfully triggers' },
      },
      {
        id: 'kit3',
        charId: 'Kit',
        slot: 3,
        // v0.3.15: 2 points at a one-off "8 or more" bar became 1 point per KIT3_HITS_PER_POINT
        // attacks. The threshold version was Kit's only real earner and it was capped at a single
        // payout per battle — 6 points across the whole game — while every other character's slot-①
        // and slot-② conditions repeat without a ceiling. A typical battle lands 8-9 attacks, so the
        // usual payout is unchanged; what changes is that beating the bar by a lot now pays for it.
        points: 1,
        perOccurrence: true,
        desc: { th: 'โจมตีบอสครบทุก 4 ครั้ง', en: 'Every 4 attacks landed on the boss' },
      },
    ],
  },
  Liora: {
    id: 'Liora',
    job: { th: 'Wizard', en: 'Wizard' },
    hp: 11,
    startSlot: 23,
    reviveHp: 6,
    // ① Fireball ② ManaCharge ③ Meteor. Liora is the template's one sanctioned "supports only
    // herself" case (§8.0) — she is the payload the other three set up, not a setter-upper.
    // v0.4.0: common attack + 3 cards, plus the always-on ManaCharge passive (PASSIVES.Liora).
    skills: ['AirPush', 'Fireball', 'AuraCharge', 'Meteor'],
    score: [
      {
        id: 'liora1',
        charId: 'Liora',
        slot: 1,
        points: 1,
        perOccurrence: true,
        // 15 -> 14 (2026-08-13): lets a fully-charged Fireball (max 14 dmg, unchanged) qualify on
        // its own instead of only Meteor/buffed hits — see docs/BALANCE_NOTES.md. Confirmed
        // near-zero balance impact by sim (this exact threshold was tried as 15->13 on 2026-08-11
        // and reverted for being negligible either way).
        desc: { th: 'ทำ dmg ครั้งเดียวได้ 14 ขึ้นไป', en: 'Deal 14+ damage in one hit' },
      },
      {
        id: 'liora2',
        charId: 'Liora',
        slot: 2,
        // 2 -> 1: this fires on the *same hit* as liora1 most of the time (a 2-mana Meteor is
        // 19 damage, comfortably over liora1's 14), so at 2 points one action was paying her 3 and
        // her conditions compounded instead of pulling in different directions — measured 42.8% win
        // share under competitive (hard-bot) play. See docs/BALANCE_NOTES.md.
        points: 1,
        perOccurrence: true,
        // v0.3.7: was "Land the Last Shot" (3pts), now the universal LAST_SHOT_POINTS bonus. This
        // replaces it with the wizard fantasy stated as a rule: mana is only ever gained by spending
        // a turn on Aura Charge (the ManaCharge passive), so a full 3-mana cast means she committed
        // two turns to one spell and needed the party to keep her alive through the wind-up.
        desc: {
          th: 'ร่ายอัดพลัง — จ่ายมานา 2 ขึ้นไปแล้วเวทย์เข้าเป้า',
          en: 'Charged cast: spend 2+ mana on a spell and land it',
        },
      },
      {
        id: 'liora3',
        charId: 'Liora',
        slot: 3,
        // 3 -> 2 (original tuning): at 3 this was the single largest personal payout in the game
        // (7.38 pts/win under competitive play, against Eric's biggest at 5.20).
        //
        // 2 -> 3 (v0.3.16): reverted. The condition itself already gates hard — it only pays if she
        // both survives AND lands the ⏱7 Meteor that risk was for, unlike Luna's luna3 (survive alone)
        // or Eric's eric3 (drop below half, survive) which ask for less. At 2 she was underpaid for a
        // harder bar than the other survival-style conditions clear.
        points: 3,
        perOccurrence: false,
        // v0.3.7: was a bare "end the battle without dying" (2pts) — at a 91.5% win rate that fired
        // in 82% of battles and made up 39% of her score for doing nothing in particular, which is
        // most of why she won 40.9% of games against Eric's 8.8%. Surviving now only pays when she
        // also delivered the big spell she survived *for*.
        desc: {
          th: 'ร่ายใหญ่สำเร็จโดยรอด — จบยกโดยไม่ตาย และได้ใช้ Meteor เข้าเป้าในยกนั้น',
          en: 'End the battle without dying, having landed at least one Meteor during it',
        },
      },
    ],
  },
  Luna: {
    id: 'Luna',
    job: { th: 'Cleric', en: 'Cleric' },
    hp: 13,
    startSlot: 23,
    reviveHp: 7,
    // ① Smite ② Blessing ③ Heal — Heal is her identity card, not her team-support one.
    // v0.4.0: common attack + 3 cards, plus the always-on HolyWater passive (PASSIVES.Luna).
    skills: ['Hitting', 'AuraSmite', 'Blessing', 'Heal'],
    score: [
      {
        id: 'luna1',
        charId: 'Luna',
        slot: 1,
        // v0.3.15: was "Heal restores at least 1 HP to an ally" at 3 points. That version's fire rate
        // was outside her control — bots pick Heal on HP need, never on point value — so it had been
        // repriced 1 -> 3 without ever fixing the real problem, which is structural: Luna is the only
        // character with no card that can finish a boss, so she earns the universal Last Shot bonus
        // 0.13 times per win against everyone else's 1.6-2.5. She loses roughly two points a game
        // before play even starts, and no amount of healing pays that back.
        //
        // This version pays her for the thing she actually does: making everyone else's turn work.
        // She scores whenever *anybody else* scores, which is the cleanest possible statement of the
        // support role and the one payout that scales with how well the whole table is doing rather
        // than with how injured it is.
        points: 1,
        perOccurrence: true,
        desc: { th: 'ผู้เล่นคนอื่นทำแต้มครบทุก 3 ครั้ง', en: 'Every 3 scoring plays by other players' },
      },
      {
        id: 'luna2',
        charId: 'Luna',
        slot: 2,
        // Tried at 2 to compensate for Luna essentially never landing a Last Shot (0.04 pts/win
        // against Kit's 2.65), but it overshot badly under competitive play — she went to a 38.8%
        // win share. Back to 1; her Last Shot gap is real but small next to luna3's reliability.
        points: 1,
        perOccurrence: true,
        desc: {
          th: 'คนที่อยู่ใต้ Blessing ของคุณ ทำ dmg ครั้งเดียวได้มากกว่า 15',
          en: 'An ally under your Blessing deals more than 15 damage in one hit',
        },
      },
      {
        id: 'luna3',
        charId: 'Luna',
        slot: 3,
        // 3 -> 2 (v0.3.7): the condition itself is right for her role, but at a 91.5% win rate it
        // fired in ~70% of battles and accounted for 50% of Luna's entire score — the largest single
        // payout in the game, mostly earned by the party simply not dying. Cutting the value trims
        // her lead without touching what the condition rewards.
        //
        // 2 -> 3 (v0.3.16): her personal conditions were repriced under v0.3.14's more frequent boss
        // actions, but the fix that has actually stuck is a spike, not a rate — luna1's per-occurrence
        // trickle keeps her average score competitive without ever letting her win a close game the
        // way Eric's eric3 or a big Meteor can. This is her one spike card, so it goes back up.
        points: 3,
        perOccurrence: false,
        desc: { th: 'จบยกบอสโดยไม่มีใครในวงตายเลย', en: 'End the battle with no party member ever dying' },
      },
    ],
  },

  // ══════════════ v0.4.0 — human-only roster (see V040_CHAR_IDS) ══════════════

  Chronos: {
    id: 'Chronos',
    job: { th: 'Time Mage', en: 'Time Mage' },
    hp: 10,
    startSlot: 23,
    reviveHp: 5,
    // ① Hourglass Shard ② Haste ③ Rewind. The only character who can move the clock itself.
    skills: ['Tick', 'HourglassShard', 'Haste', 'Rewind'],
    score: [
      {
        id: 'chronos1',
        charId: 'Chronos',
        slot: 1,
        // The one condition in the game built on hidden information. v0.3.14 made the boss stop
        // announcing its move, so *which* move is coming is the only thing on the board nobody can
        // read — Chronos is the only character who is paid for reading it anyway. Declared alongside
        // an action (`predictedBossMove` on the choice), checked the next time the boss acts.
        points: 2,
        perOccurrence: true,
        desc: {
          th: 'ทำนายท่าบอสถูก — ประกาศ A/B/C ไว้ตอนสั่งแอคชัน แล้วบอสออกท่านั้นจริง',
          en: "Correctly call the boss's next move (A/B/C), declared alongside your action",
        },
      },
      {
        id: 'chronos2',
        charId: 'Chronos',
        slot: 2,
        points: 1,
        perOccurrence: true,
        desc: {
          th: 'เพื่อนที่คุณเร่งด้วย Haste ทำดาเมจใส่บอสในตาที่ถูกเร่ง',
          en: 'An ally you hasted deals damage on the visit you bought them',
        },
      },
      {
        id: 'chronos3',
        charId: 'Chronos',
        slot: 3,
        // His whole kit spends his own ⏱ to buy the table time, so the end-of-battle clock is the
        // honest scoreboard for whether that trade paid off.
        points: 3,
        perOccurrence: false,
        desc: {
          th: 'จบยกบอสโดยเหลือเวลาอย่างน้อย 8 ช่อง',
          en: 'End the battle with at least 8 clock slots left',
        },
      },
    ],
  },

  Kage: {
    id: 'Kage',
    job: { th: 'Ninja', en: 'Ninja' },
    hp: 11,
    startSlot: 23,
    reviveHp: 6,
    // ① Twin Fang ② Smoke Bomb ③ Assassinate. Fastest kit in the game (⏱2/2/3/4).
    skills: ['Shuriken', 'TwinFang', 'SmokeBomb', 'Assassinate'],
    score: [
      {
        id: 'kage1',
        charId: 'Kage',
        slot: 1,
        // Reads `battle.finishedBySkill`, which the engine has recorded since v0.3.0 with no rule
        // ever reading it (DESIGN_VARIABLES §2 #19). This is that hook finally being used.
        points: 4,
        perOccurrence: false,
        desc: { th: 'ปิดจ๊อบบอสด้วย Assassinate', en: 'Land the killing blow with Assassinate' },
      },
      {
        id: 'kage2',
        charId: 'Kage',
        slot: 2,
        points: 1,
        perOccurrence: true,
        desc: { th: 'ออกจากการซ่อนตัวแล้วโจมตีเข้า', en: 'Break stealth with a landed attack' },
      },
      {
        id: 'kage3',
        charId: 'Kage',
        slot: 3,
        points: 3,
        perOccurrence: false,
        desc: {
          th: 'จบยกบอสโดยไม่เคยถูกบอสโจมตีเลยสักครั้ง',
          en: 'End the battle having never been hit by the boss',
        },
      },
    ],
  },

  Morvane: {
    id: 'Morvane',
    job: { th: 'Necromancer', en: 'Necromancer' },
    hp: 9,
    startSlot: 23,
    reviveHp: 5,
    // ① Soul Siphon ② Raise Dead ③ Death Coil. Undead: Heal cannot touch him.
    skills: ['Drain', 'SoulSiphon', 'RaiseDead', 'DeathCoil'],
    score: [
      {
        id: 'morvane1',
        charId: 'Morvane',
        slot: 1,
        // Count-and-exchange, the same shape as kit3 and luna1 — one idea for the table to learn.
        points: 1,
        perOccurrence: true,
        desc: { th: 'สะสมวิญญาณครบทุก 3 ดวง', en: 'Every 3 souls collected' },
      },
      {
        id: 'morvane2',
        charId: 'Morvane',
        slot: 2,
        // Deliberately the largest per-occurrence payout any character has. A character who profits
        // from death is only safe in a semi-co-op game if the profitable thing is *undoing* it —
        // this is what keeps him from wanting allies to stay down.
        points: 3,
        perOccurrence: true,
        desc: { th: 'ชุบเพื่อนที่ล้มแล้วให้กลับมาด้วย Raise Dead', en: 'Bring a downed ally back with Raise Dead' },
      },
      {
        id: 'morvane3',
        charId: 'Morvane',
        slot: 3,
        points: 3,
        perOccurrence: false,
        desc: {
          th: 'จบยกบอสโดย HP เหลือน้อยกว่า 4 แต่ไม่เคยล้ม',
          en: 'End the battle below 4 HP without ever going down',
        },
      },
    ],
  },
};

export function skillDef(id: SkillId): SkillDef {
  return SKILLS[id];
}
export function skillStats(id: SkillId, isLv2: boolean): SkillLevelStats {
  const s = SKILLS[id];
  return isLv2 ? s.lv2 : s.lv1;
}

/** Universal Last Shot bonus (v0.3.7): whoever lands the killing blow on a boss scores this,
 *  whatever character they are. Previously this was a *personal* condition worth 3 points that only
 *  Eric (eric2) and Liora (liora2) had, so Kit and Luna scored nothing for the same act — measured at
 *  a 4.6x win-share gap between Liora and Eric (docs/BALANCE_NOTES.md). Kept out of CHARACTERS[].score
 *  on purpose: it belongs to no one character, and the end-of-game breakdown groups it the same way
 *  'timeBonus' is grouped. */
export const LAST_SHOT_POINTS = 2;
export const LAST_SHOT_CONDITION_ID = 'lastShot';

/** Mana Liora must commit to a single spell for liora2 to score. Every point of mana costs her a whole
 *  turn on Aura Charge (the ManaCharge passive is the only source), so 2 already means she spent two
 *  turns setting up one cast. Set to 3 at first and measured at 0.00 fires per win across 3,000
 *  games — nobody ever banks that long — see docs/BALANCE_NOTES.md. */
export const VERA_CHARGED_CAST_MANA = 2;

/** kit3 pays 1 point per this many attacks on the boss (v0.3.15), replacing a single "8 or more"
 *  milestone that could only ever pay once a battle. */
export const KIT3_HITS_PER_POINT = 4;

/** luna1 pays 1 point per this many scoring plays by *other* players (v0.3.15). Priced by
 *  measurement, not taste: at 1 point per single event she scored 19.65/win against the party's ~13
 *  and won 99.5% of games, so the condition's shape was right and only its rate was wrong. Same
 *  count-and-exchange shape as KIT3_HITS_PER_POINT deliberately — one idea for the table to learn. */
export const LUNA1_ALLY_SCORES_PER_POINT = 3;

/** Liora's "one big impact" bar — scores liora1 on every hit that reaches it, and latches the half of
 *  liora3 that asks whether she actually delivered this battle. One threshold, both conditions. */
export const VERA_BIG_HIT_DAMAGE = 14;

/** Single source of truth for a personal score condition's point value — scoring.ts's pushScore()
 *  calls read through this instead of repeating the number, so a rebalance only ever needs to
 *  change it here. (Doesn't cover 'timeBonus'/'lastShot', which aren't personal conditions — the
 *  first is computed from the clock's remaining slots, the second is the flat bonus above.) */
export function scorePoints(conditionId: string): number {
  // ALL_CHAR_IDS, not CHAR_IDS: v0.4.0's three characters are outside the bot-facing pool but
  // their conditions still have to resolve whenever a human is playing one.
  for (const charId of ALL_CHAR_IDS) {
    const c = CHARACTERS[charId].score.find((s) => s.id === conditionId);
    if (c) return c.points;
  }
  throw new Error(`unknown score condition: ${conditionId}`);
}

// ══════════════════════ v0.4.0 tuning constants ══════════════════════
// All of these are first-guess numbers. Nothing here has been through a balance sim — the three
// v0.4.0 characters are human-only precisely because the sim cannot price them (bots value skills
// by damage-per-⏱ and cannot see sand, shadow, souls, stealth, or a marker rewind at all).

/** Chronos: sand cap, the ⏱ bar a declare must meet to bank sand, and what Rewind costs.
 *
 *  The bar is 3, not 4. At 4 the economy deadlocked outright: his only ⏱4+ card is Rewind itself,
 *  so the one action that could bank sand was the one that required it, and he could never cast it
 *  at all. At 3 both Hourglass Shard and Haste feed the meter, which puts Rewind about three
 *  committed turns away — a signature you build toward rather than a rotation piece. */
export const SAND_MAX = 4;
export const SAND_PER_SLOW_DECLARE = 3;
export const SAND_PER_REWIND = 3;

/** Kage: shadow cap and Assassinate's cost. Shadow only accrues on visits where the boss did not
 *  touch him, so the resource itself is a reward for playing evasively. */
export const SHADOW_MAX = 3;
export const SHADOW_PER_ASSASSINATE = 2;
/** Assassinate deals its `secondary` execute damage when the boss is at or below this fraction of
 *  max HP. Kept as a fraction rather than a flat number so it reads the same on all three bosses. */
export const ASSASSINATE_EXECUTE_THRESHOLD = 0.25;
/** Bonus damage the execute window adds on top of `primary`. */
export const ASSASSINATE_EXECUTE_BONUS = 8;

/** Morvane: souls needed per morvane1 payout, Death Coil's soul cost, and the HP surcharge that
 *  upgrades Death Coil from `primary` to `secondary` damage. */
export const SOULS_PER_POINT = 3;
export const SOULS_PER_DEATH_COIL = 3;
export const DEATH_COIL_HP_COST = 3;
/** A single hit costing him this much HP or more yields a soul. Set at 3 so ordinary chip damage
 *  does not feed the engine — he has to actually be in danger. */
export const SOUL_HP_LOSS_THRESHOLD = 3;
/** Self-heal on Drain / Soul Siphon. The only HP Morvane can ever regain: Heal is barred by his
 *  Undead Pact passive, which is the single hardest rule exception on the roster. */
export const LIFESTEAL: Partial<Record<SkillId, number>> = { Drain: 1, SoulSiphon: 2 };

/** chronos3's clock bar, and how far Haste drags an ally up the clock (read off the skill's
 *  `primary`, this is only the ceiling used for validation). */
export const CHRONOS_TIME_LEFT_BAR = 8;

/** Which characters may only ever be taken by a human seat, and only in the v0.4.0 ruleset. */
export function isHumanOnlyCharacter(charId: CharId): boolean {
  return V040_CHAR_IDS.includes(charId);
}

/** morvane3's bar — "alive, but only just". Harsher than eric3's half-HP latch on purpose: he is
 *  the one character Heal cannot touch, so finishing a battle this low is a real achievement rather
 *  than an accident. */
export const MORVANE_LOW_HP_BAR = 4;
