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
import { STABLE_RULESET, hasV045Content, type RulesetVersion } from './rulesets';

export type CharId = 'Eric' | 'Kit' | 'Liora' | 'Luna' | 'Chrono' | 'Kage' | 'Morvane';

/** The v0.3.x roster — the only characters bots ever play, and the whole pool in the stable
 *  ruleset. v0.4.0's three additions are human-only; see V040_CHAR_IDS. */
export const CHAR_IDS: CharId[] = ['Eric', 'Kit', 'Liora', 'Luna'];

/** v0.4.0 (experimental): human-only additions. Bots have no heuristics for their resources —
 *  `estimateChoiceValue` prices skills by damage-per-⏱ and cannot see sand, shadow, souls, or a
 *  marker rewind at all — so letting a bot draft one would measure the bot's blind spot rather
 *  than the character. Gated behind the v0.4.0 ruleset AND behind being a human seat. */
export const V040_CHAR_IDS: CharId[] = ['Chrono', 'Kage', 'Morvane'];

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
  // Chrono (v0.4.0)
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
  | 'DeathCoil'
  // ── v0.4.5 rework ── replacement cards for the four core characters. New ids rather than
  // rewritten ones on purpose: Sighting Shot is not a re-tuned Quick Shot, it is a different card
  // that banks Focus, and a v0.3 save must keep meaning exactly what it meant. Which of the two
  // versions a character holds is decided by charSkills(charId, ruleset) — nothing else.
  | 'SightingShot' // Kit ⓪ — replaces Quick Shot
  | 'ManaDrain' // Liora ⓪ — replaces Air Push
  | 'Freeze' // Liora ① — replaces Fireball
  | 'AuraShield' // Liora ② — replaces Aura Charge
  | 'HolySmite' // Luna ⓪ — replaces Hitting
  | 'Praying'; // Luna ① — replaces Aura Smite

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
  | 'buffHaste' // Haste (Chrono) — immediate: drags an ally's pawn back up the clock so they act sooner
  | 'buffStealth' // Smoke Bomb (Kage) — immediate: hides everyone sharing the caster's slot
  | 'raise' // Raise Dead (Morvane) — immediate: revives a downed ally now instead of on their revive slot
  | 'rewind' // Rewind (Chrono ③) — immediate: walks the *clock marker itself* back up
  // ── v0.4.5 ──
  | 'manaGain' // Praying (Luna) — immediate: banks mana and nothing else
  | 'buffShield'; // Aura Shield (Liora) — immediate: flat damage reduction on *any* ally, self included

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

  // ─────────────── v0.4.5 rework ───────────────
  // Five small, orthogonal flags rather than five new SkillKinds. Each one is a *cost or a rider*
  // bolted onto a card that still resolves through its existing kind — Sighting Shot is an ordinary
  // `attack` that also banks Focus, Heal is an ordinary `heal` that also costs mana — so giving
  // each its own kind would have forked the resolution switch four extra ways for no gain.

  /** Mana banked the instant this card is declared (Mana Drain +1, Praying +3). */
  manaGain?: number;
  /** Focus banked the instant this card is declared (Sighting Shot +1). Kit's resource: it does
   *  nothing on its own, it is only ever spent to nudge a d6 up. */
  focusGain?: number;
  /** Whether Focus may be spent on this card's dice check, 1 Focus = +1 to the die. Uncapped by
   *  design: Focus costs Kit a whole ⏱2 turn per point, so "spend six" already means six turns not
   *  spent shooting — the price is paid in the same currency the clock charges for everything else. */
  focusSpendable?: boolean;
  /** Roll this or better on a d6 to also inflict ❄️ Slow on the boss (Freeze). Rides the attack
   *  rather than replacing it, so a missed roll still deals full damage. */
  slowRollTarget?: number;
  /** Mana that must be in hand and is spent on declare (Heal costs 2 in the rework). Separate from
   *  `attackMana`'s optional variable spend, which is a choice; this one is a gate. */
  manaCost?: number;
  /** HP the caster pays on every use, ignoring all mitigation (Power Strike in the rework — the
   *  theme is a swing past what the body can take). Never allowed to be lethal; see declareSkill. */
  selfHpCost?: number;

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
  | 'UndeadPact'
  // v0.4.5 — replaces Holy Water on Luna. A new id rather than a reworded HolyWater because it is a
  // different trait entirely: Holy Water warded a debuff, this one is a mana engine.
  | 'DivineTithe';

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
  Chrono: {
    id: 'TimeSpiral',
    charId: 'Chrono',
    name: { th: 'เกลียวเวลา', en: 'Time Spiral' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: ทุกครั้งที่ประกาศสกิลที่ใช้เวลา ⏱3 ขึ้นไป ได้เม็ดทราย +1 (สูงสุด 4) — ทรายคือค่าใช้จ่ายของ Rewind',
      en: 'Always active: every time Chrono declares a skill costing ⏱3 or more, he gains 1 sand (max 4). Sand is what Rewind spends.',
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
  /** v0.4 camp ruleset only. Lower acts sooner. Used *solely* as the tie-break for camp shopping
   *  order when two players are level on points — it is deliberately NOT a combat stat, because a
   *  global speed modifier would rescale every ⏱ in the game and void BALANCE_NOTES wholesale.
   *  Ordering follows each kit's existing ⏱ profile: Kage's is the lightest on the roster, Chrono's
   *  signature is a ⏱6, and EXPANSION_DESIGN §3.2 already calls him "ช้า". */
  speed: number;
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

  // ══ v0.4.0 — Chrono, the Time Mage ══
  // His ⏱ numbers are deliberately ordinary; his speed axis is "ช้า" (slow) expressed as a ⏱6
  // signature rather than a global modifier, so nothing in the engine needs a speed multiplier.
  Tick: {
    id: 'Tick',
    charId: 'Chrono',
    kind: 'attack',
    immediate: true,
    name: { th: 'Tick', en: 'Tick' },
    lv1: { time: 2, primary: 2 },
    lv2: { time: 2, primary: 3 },
  },
  HourglassShard: {
    id: 'HourglassShard',
    charId: 'Chrono',
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
    charId: 'Chrono',
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
    charId: 'Chrono',
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

  // ══════════════ v0.4.5 — the reworked core four ══════════════
  // These six cards exist only in the v0.4.5 ruleset. They are never in any v0.3 character's skill
  // list (charSkills() decides that), so their numbers can be set freely without touching the one
  // ruleset that has actually been balance-tested.

  SightingShot: {
    id: 'SightingShot',
    charId: 'Kit',
    kind: 'attack',
    immediate: true,
    focusGain: 1,
    name: { th: 'Sighting Shot', en: 'Sighting Shot' },
    // Quick Shot's ⏱2 slot, repriced as the front of an economy rather than as filler. The damage
    // is deliberately unexciting — what the card actually sells is a Focus, which is what turns
    // Sharp Shooting and Trap! from dice gambles into things Kit can decide to make happen.
    lv1: { time: 2, primary: 3 },
    lv2: { time: 2, primary: 4 },
  },
  ManaDrain: {
    id: 'ManaDrain',
    charId: 'Liora',
    kind: 'attack',
    immediate: true,
    manaGain: 1,
    name: { th: 'Mana Drain', en: 'Mana Drain' },
    // The rework's single biggest change to Liora: mana now comes off a card that *also* deals
    // damage. Under v0.3 her only mana source was Aura Charge, a turn that produced nothing, so
    // every point of mana cost the party a whole visit's worth of output — which is exactly why
    // liora2 measured 0.00 fires per win at a 3-mana bar. Charging up is no longer a dead turn.
    lv1: { time: 2, primary: 3 },
    lv2: { time: 2, primary: 4 },
  },
  Freeze: {
    id: 'Freeze',
    charId: 'Liora',
    kind: 'attackMana',
    slowRollTarget: 4,
    name: { th: 'Freeze', en: 'Freeze' },
    // Fireball's numbers exactly, plus a 50% (4+ on a d6) chance to push the boss's pawn 2 slots
    // further down the clock. The roll rides the attack instead of gating it: a miss is still a
    // full-damage spell, so the card never reads as a wasted turn — the same lesson v0.3.15 learned
    // when Trap!'s all-or-nothing version measured at 85 declares in 3,000 games.
    lv1: { time: 3, primary: 5, secondary: 3 },
    lv2: { time: 3, primary: 8, secondary: 3 },
  },
  AuraShield: {
    id: 'AuraShield',
    charId: 'Liora',
    kind: 'buffShield',
    name: { th: 'Aura Shield', en: 'Aura Shield' },
    // secondary = flat damage reduction, +1 over Aura Charge's, and castable on an ally instead of
    // only on herself. It no longer grants mana (Mana Drain does that now), which is what stops the
    // card from being the mandatory opener it was: it is played when someone needs protecting.
    lv1: { time: 2, primary: 0, secondary: 4 },
    lv2: { time: 2, primary: 0, secondary: 6 },
  },
  HolySmite: {
    id: 'HolySmite',
    charId: 'Luna',
    kind: 'attack',
    ignoresArmor: true,
    immediate: true,
    name: { th: 'Holy Smite', en: 'Holy Smite' },
    // Hitting's ⏱2 and damage, but armor never applies. Against Aurelius (armor 4) the old Hitting
    // landed for 0 and Luna's common attack was literally worthless; this is the fix.
    lv1: { time: 2, primary: 2 },
    lv2: { time: 2, primary: 3 },
  },
  Praying: {
    id: 'Praying',
    charId: 'Luna',
    kind: 'manaGain',
    manaGain: 3,
    name: { th: 'Praying', en: 'Praying' },
    // ⏱3 for 3 mana — one turn buys one Heal (2) with change. Luna's mana is uncapped and wiped
    // between battles, so banking it is a bet on this battle lasting, not a stockpile across the
    // game.
    lv1: { time: 3, primary: 0 },
    lv2: { time: 3, primary: 0 },
  },
};

/** Per-ruleset changes to cards that keep their identity. Anything that becomes a *different card*
 *  got a new SkillId above instead; this table is only for "same card, different numbers or a new
 *  rider". Merged in by skillDefFor()/skillStats(), which are the only two readers.
 *
 *  Nothing here can reach a v0.3 game: both readers take the ruleset and ignore this table unless
 *  hasV045Content() is true. */
export interface SkillOverride {
  ignoresArmor?: boolean;
  immediate?: boolean;
  manaGain?: number;
  focusGain?: number;
  focusSpendable?: boolean;
  slowRollTarget?: number;
  manaCost?: number;
  selfHpCost?: number;
  lv1?: Partial<SkillLevelStats>;
  lv2?: Partial<SkillLevelStats>;
}

export const V045_SKILL_OVERRIDES: Partial<Record<SkillId, SkillOverride>> = {
  // Eric: both attacks hit harder, and the big one now costs him HP every swing. That cost is not a
  // downside bolted on for flavour — it is what makes his own Berserk passive (+4 below half HP)
  // and his rework score conditions (survive the battle; land 10+ hits) pull against each other,
  // which is the whole point of a berserker who is also the party's protector.
  Slash: { lv1: { primary: 4 }, lv2: { primary: 5 } },
  PowerStrike: { selfHpCost: 1, lv1: { primary: 7 }, lv2: { primary: 10 } },
  // Kit: the two dice cards accept Focus. Numbers untouched — the whole change is that the roll
  // stops being pure luck.
  SharpShooting: { focusSpendable: true },
  Trap: { focusSpendable: true },
  // Luna: Blessing swaps its emphasis from offence to protection (atk 3→2, armor 2→3), and Heal
  // stops being free. A cleric who must pay for every heal has to choose between healing and
  // praying, which is the decision the whole rework is built around.
  Blessing: { lv1: { primary: 2, secondary: 3 }, lv2: { primary: 3, secondary: 4 } },
  Heal: { manaCost: 2 },
};

export const CHARACTERS: Record<CharId, CharacterDef> = {
  Eric: {
    id: 'Eric',
    job: { th: 'Knight', en: 'Knight' },
    hp: 16,
    startSlot: 23,
    reviveHp: 8,
    speed: 5,
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
    speed: 2,
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
    speed: 4,
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
    speed: 3,
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

  Chrono: {
    id: 'Chrono',
    job: { th: 'Time Mage', en: 'Time Mage' },
    hp: 10,
    startSlot: 23,
    reviveHp: 5,
    speed: 6,
    // ① Hourglass Shard ② Haste ③ Rewind. The only character who can move the clock itself.
    skills: ['Tick', 'HourglassShard', 'Haste', 'Rewind'],
    score: [
      {
        id: 'chrono1',
        charId: 'Chrono',
        slot: 1,
        // The one condition in the game built on hidden information. v0.3.14 made the boss stop
        // announcing its move, so *which* move is coming is the only thing on the board nobody can
        // read — Chrono is the only character who is paid for reading it anyway. Declared alongside
        // an action (`predictedBossMove` on the choice), checked the next time the boss acts.
        points: 2,
        perOccurrence: true,
        desc: {
          th: 'ทำนายท่าบอสถูก — ประกาศ A/B/C ไว้ตอนสั่งแอคชัน แล้วบอสออกท่านั้นจริง',
          en: "Correctly call the boss's next move (A/B/C), declared alongside your action",
        },
      },
      {
        id: 'chrono2',
        charId: 'Chrono',
        slot: 2,
        points: 1,
        perOccurrence: true,
        desc: {
          th: 'เพื่อนที่คุณเร่งด้วย Haste ทำดาเมจใส่บอสในตาที่ถูกเร่ง',
          en: 'An ally you hasted deals damage on the visit you bought them',
        },
      },
      {
        id: 'chrono3',
        charId: 'Chrono',
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
    speed: 1,
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
    speed: 4,
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

/** The card as this ruleset plays it: the base definition with V045_SKILL_OVERRIDES merged on top
 *  when the rework is on. Every reader that cares about a card's *riders* (mana cost, HP cost,
 *  whether Focus may be spent on its roll) goes through here rather than through SKILLS directly —
 *  readers that only want the kind or the name may keep using SKILLS, since neither ever differs. */
export function skillDefFor(id: SkillId, ruleset: RulesetVersion): SkillDef {
  const base = SKILLS[id];
  if (!hasV045Content(ruleset)) return base;
  const ov = V045_SKILL_OVERRIDES[id];
  if (!ov) return base;
  const { lv1, lv2, ...flags } = ov;
  return { ...base, ...flags, lv1: { ...base.lv1, ...lv1 }, lv2: { ...base.lv2, ...lv2 } };
}

/** `ruleset` is optional and defaults to the stable one so every pre-rework caller — the v0.3 tests,
 *  the balance sim, the UI paths that never had a ruleset to hand — keeps its exact behaviour with
 *  no edit. Passing it is what opts a call site into the rework's numbers. */
export function skillStats(id: SkillId, isLv2: boolean, ruleset: RulesetVersion = STABLE_RULESET): SkillLevelStats {
  const s = skillDefFor(id, ruleset);
  return isLv2 ? s.lv2 : s.lv1;
}

/** Which four cards a character holds in this ruleset. The single switch that turns the rework on
 *  or off for a given character — swap the list and the draft, the UI, the bots and the engine all
 *  follow, because none of them reads CHARACTERS[…].skills directly any more. */
export function charSkills(charId: CharId, ruleset: RulesetVersion): SkillId[] {
  if (hasV045Content(ruleset)) {
    const reworked = V045_CHAR_SKILLS[charId];
    if (reworked) return reworked;
  }
  return CHARACTERS[charId].skills;
}

/** The reworked kits. Eric keeps his four card *ids* (his changes are all numbers and scoring, held
 *  in V045_SKILL_OVERRIDES and V045_SCORE), so he is deliberately absent here. */
export const V045_CHAR_SKILLS: Partial<Record<CharId, SkillId[]>> = {
  Kit: ['SightingShot', 'SharpShooting', 'Trap', 'MultiShot'],
  Liora: ['ManaDrain', 'Freeze', 'AuraShield', 'Meteor'],
  Luna: ['HolySmite', 'Praying', 'Heal', 'Blessing'],
};

/** This character's three score conditions as this ruleset scores them. */
export function charScore(charId: CharId, ruleset: RulesetVersion): ScoreConditionDef[] {
  if (hasV045Content(ruleset)) {
    const reworked = V045_SCORE[charId];
    if (reworked) return reworked;
  }
  return CHARACTERS[charId].score;
}

/** The always-on trait as this ruleset states it. Only the wording and, for Eric, the threshold
 *  differ — the ids stay put so nothing keyed on PassiveId has to branch. */
export function charPassive(charId: CharId, ruleset: RulesetVersion): PassiveDef | undefined {
  if (hasV045Content(ruleset)) {
    const reworked = V045_PASSIVES[charId];
    if (reworked) return reworked;
  }
  return PASSIVES[charId];
}

// ══════════════════════ v0.4.5 rework constants ══════════════════════
// Same health warning as the v0.4.0 block above, and then some: these are first-guess numbers for a
// ruleset the sim can only partially price. `tools/balance.ts --ruleset v0.4` measures them for the
// four core characters (unlike Chrono/Kage/Morvane, all four are still bot-playable), but the bots
// value Focus and Luna's mana with hand-written heuristics rather than by search, so read the
// output as "nothing is catastrophically broken", not as a tuned balance.

/** Mana Luna opens every battle with. Uncapped afterwards and wiped between battles — banking is a
 *  bet on *this* fight running long, never a stockpile carried into the next one. 5 is exactly two
 *  Heals plus change, so she starts the battle already able to act as a cleric rather than having
 *  to spend her first two turns earning the right to. */
export const V045_LUNA_START_MANA = 5;

/** Damage a *single hit* must do for Luna to tithe 1 mana from it. Party-wide, not Luna's own: her
 *  whole design is that she has almost no damage of her own, so keying the engine to her output
 *  would have made the passive fire about once a battle.
 *
 *  Judged per hit with no carry (see grantDivineTithe) — a 9-damage swing pays nothing and is not
 *  remembered, and the change from a 25-damage one is lost rather than banked toward the next. That
 *  is what makes the passive answer to *decisive blows* rather than to the battle merely lasting a
 *  while, and it is why the bar can sit this high: at 7 with a running carry she drew roughly 15
 *  mana a battle against a ceiling of about 10 she could actually spend, which made Praying a
 *  skipped turn and Heal's mana cost meaningless. */
export const V045_LUNA_MANA_PER_BOSS_DAMAGE = 10;

/** Liora's mana ceiling, unchanged from v0.3 — what changed is that Mana Drain fills it while
 *  dealing damage. Luna is deliberately NOT subject to this; see V045_LUNA_START_MANA. */
export const V045_LIORA_MANA_MAX = 3;

/** Damage Liora's Aura Shield gains per mana poured into it, matching the +3 per mana her attack
 *  spells get. One number for both halves of the passive, so "what is a mana worth" has one answer. */
export const V045_AURASHIELD_DEF_PER_MANA = 3;

/** How far down the clock a landed ❄️ Slow pushes the boss's pawn — it acts that many slots later.
 *  Applied to the boss's pawn rather than to its declared move so it stacks cleanly with Trap!'s
 *  own delay and needs no new state to track. */
export const V045_SLOW_BOSS_SLOTS = 2;

/** kit3's rate in the rework: 5 attacks per point, up from 4. Sighting Shot at ⏱2 plus a Focus-fed
 *  Sharp Shooting makes Kit's attack count climb faster than v0.3's did, so the same payout per
 *  battle needs a longer count. */
export const V045_KIT3_HITS_PER_POINT = 5;

/** kit3's rate for the ruleset in play — the one reader of both KIT3_HITS_PER_POINT constants. */
export function kit3HitsPerPoint(ruleset: RulesetVersion): number {
  return hasV045Content(ruleset) ? V045_KIT3_HITS_PER_POINT : KIT3_HITS_PER_POINT;
}

/** How many Guard redirects eric2 needs in one battle before it pays. Two, not one: a single save
 *  can be luck of the boss's targeting roll, but choosing to stand in front of someone twice in one
 *  battle is a strategy. */
export const V045_ERIC_GUARD_SAVES_BAR = 2;

/** The bar luna1 asks for in the rework: the heal target must be strictly under this fraction of
 *  their max HP at the moment the heal resolves. 30% is deliberately below the 35% the bot already
 *  used as its "urgent" cutoff, so scoring costs Luna something — she has to let an ally slide past
 *  the point she would have topped them up anyway, which runs straight into luna3's "nobody dies".
 *  Read pre-heal, so a heal that lifts them clear still pays. */
export const V045_LUNA1_HEAL_HP_PCT = 0.3;

/** luna2's bar in the rework: >14 in one hit from someone under her Blessing, down from >15. Moves
 *  with Blessing's own attack buff, which the rework cut 3 -> 2. */
export const V045_LUNA2_BLESSED_HIT_DAMAGE = 14;

/** luna3's intact value, and what each death this battle takes off it. The payout is
 *  `max(0, BASE - PENALTY * deaths)` — see the luna3 entry in V045_SCORE for why it slopes rather
 *  than being all-or-nothing. */
export const V045_LUNA3_BASE_POINTS = 6;
export const V045_LUNA3_DEATH_PENALTY = 2;

/** v0.4.5 score conditions. Same three ids per character as v0.3 — what each id *asks for* and what
 *  it pays changes, but the id does not, so scoreLog entries, the breakdown panel and every replay
 *  keep working without a migration.
 *
 *  Kit is absent: his only change is kit3's rate, which is a constant (see kit3HitsPerPoint()). */
export const V045_SCORE: Partial<Record<CharId, ScoreConditionDef[]>> = {
  Eric: [
    {
      id: 'eric1',
      charId: 'Eric',
      slot: 1,
      // 1 -> 2. Same trigger as v0.3, but the rework hands him Slash +1, Power Strike +1 and a
      // Berserk that now fires below *half* max HP rather than below a flat 7 — so clearing 10 is
      // both more reachable and more clearly the thing he is built to do.
      points: 2,
      perOccurrence: true,
      desc: { th: 'ทำ dmg ครั้งเดียวได้มากกว่า 10', en: 'Deal more than 10 damage in one hit' },
    },
    {
      id: 'eric2',
      charId: 'Eric',
      slot: 2,
      // Per-occurrence 1pt -> a once-per-battle 3 at a bar of two saves. v0.3.15 measured the
      // uncapped version taking Eric to an 82.3% individual win share purely on redirect frequency
      // (4.36 fires per win), and halving the value only slowed that down. A threshold fixes the
      // shape rather than the price: protecting is worth points, protecting *repeatedly* is what
      // scores, and no amount of extra boss activity can inflate it past 3.
      points: 3,
      perOccurrence: false,
      desc: {
        th: `ยืนหน้าให้ทั้งวง — Guard รับดาเมจแทนเพื่อนได้ ${V045_ERIC_GUARD_SAVES_BAR} ครั้งขึ้นไปในยกนี้`,
        en: `Hold the line: Guard takes a hit for an ally ${V045_ERIC_GUARD_SAVES_BAR} or more times this battle`,
      },
    },
    {
      id: 'eric3',
      charId: 'Eric',
      slot: 3,
      // Drops v0.3's "must have dropped below half" half of the latch. That clause existed to stop
      // a 2-point payout for doing nothing, but the rework gives Eric a Power Strike that bleeds
      // him 1 HP a swing — staying up is now something he actively spends resources on rather than
      // something that happens to him.
      points: 2,
      perOccurrence: false,
      desc: { th: 'ยืนอยู่จนจบ — จบยกบอสโดยไม่ตายเลยสักครั้ง', en: 'Still standing: end the battle without ever going down' },
    },
  ],
  Liora: [
    {
      id: 'liora1',
      charId: 'Liora',
      slot: 1,
      // Repointed entirely. v0.3's liora1 was a damage threshold that fired on the same hit as
      // liora2 most of the time, so one action paid her twice and her conditions compounded instead
      // of pulling apart (measured 42.8% win share). This asks for the rework's new effect instead:
      // the ❄️ Slow, which is the half of Freeze that is not damage.
      points: 2,
      perOccurrence: true,
      desc: { th: 'Freeze ติด ❄️ ช้า ใส่บอสสำเร็จ', en: 'Freeze successfully lands ❄️ Slow on the boss' },
    },
    {
      id: 'liora2',
      charId: 'Liora',
      slot: 2,
      // 1 -> 3. The bar itself is unchanged, but what it costs changed completely: Mana Drain banks
      // mana *while dealing damage*, so a 2-mana cast no longer means two wasted turns. Paying more
      // for a condition that got easier looks backwards and isn't — under v0.3 this fired 0.00
      // times per win at 3 mana and barely at all at 2, i.e. it was priced for a play nobody made.
      points: 3,
      perOccurrence: true,
      desc: {
        th: 'ร่ายอัดพลัง — จ่ายมานา 2 ขึ้นไปแล้วเวทย์เข้าเป้า',
        en: 'Charged cast: spend 2+ mana on a spell and land it',
      },
    },
    {
      id: 'liora3',
      charId: 'Liora',
      slot: 3,
      // 3 -> 5, and the survival clause is gone. Meteor is ⏱7 on a 24-slot clock — nearly a third
      // of the battle committed to one card — and the rework did nothing to make that cheaper. The
      // survival half was doing the same job as the new eric3/luna3 and made her third condition
      // read as another "don't die" rather than as the payoff for the biggest swing in the game.
      points: 5,
      perOccurrence: false,
      desc: {
        th: 'ร่ายใหญ่สำเร็จ — Meteor เข้าเป้าอย่างน้อย 1 ครั้งในยกนี้',
        en: 'Land at least one Meteor that deals damage this battle',
      },
    },
  ],
  Luna: [
    {
      id: 'luna1',
      charId: 'Luna',
      slot: 1,
      // Off the ally echo entirely and back onto Heal, where luna1 lived before v0.3.15 — but with
      // a bar this time: the target has to be under V045_LUNA1_HEAL_HP_PCT of their max HP when the
      // heal resolves.
      //
      // The echo version had no stable rate because its frequency was the *party's* scoring rate,
      // not hers: measured across 1,500-game runs it put her win share at 11.0% when off, 38.3% at
      // every-5, 69.0% at every-3 and 100.0% at every-1. Any number picked there is only correct
      // for today's roster — tuning Kit or Liora later would silently retune Luna. The heal bar
      // instead caps at her own visit count and asks a question she can read off the board: who is
      // actually in danger right now, and can I hold the card until they are.
      points: 1,
      perOccurrence: true,
      desc: {
        th: `ทุกครั้งที่ Heal ให้ตัวละครที่มี HP ต่ำกว่า ${V045_LUNA1_HEAL_HP_PCT * 100}% ของสูงสุด`,
        en: `Every time you Heal a character below ${V045_LUNA1_HEAL_HP_PCT * 100}% of their max HP`,
      },
    },
    {
      id: 'luna2',
      charId: 'Luna',
      slot: 2,
      // Bar 15 -> 14 (V045_LUNA2_BLESSED_HIT_DAMAGE). Blessing's own attack buff dropped 3 -> 2 in
      // the rework, so holding the old bar would have quietly made this condition *harder* while the
      // card that enables it got weaker — the bar moves with it to keep the ask the same.
      points: 1,
      perOccurrence: true,
      desc: {
        th: `คนที่อยู่ใต้ Blessing ของคุณ ทำ dmg ครั้งเดียวได้มากกว่า ${V045_LUNA2_BLESSED_HIT_DAMAGE}`,
        en: 'An ally under your Blessing deals more than 14 damage in one hit',
      },
    },
    {
      id: 'luna3',
      charId: 'Luna',
      slot: 3,
      // 3 -> 6, but it is now a *sliding* payout: every death this battle costs 2, floored at 0
      // (V045_LUNA3_BASE_POINTS / V045_LUNA3_DEATH_PENALTY, applied in onBattleEndScoring).
      //
      // The v0.3 version was all-or-nothing, which made it worthless the instant anyone went down —
      // and a cleric whose signature condition is already lost has no reason to keep healing for the
      // rest of the battle. A slope keeps every subsequent save worth something: after one death
      // there are still 4 points on the table, after two there are 2. `points` here is the intact
      // value, the way kit3's is the value of one payout rather than the whole battle's.
      points: 6,
      perOccurrence: false,
      desc: {
        th: `จบยกโดยไม่มีใครตายเลย — ${V045_LUNA3_BASE_POINTS} แต้ม · ทุกการตายหัก ${V045_LUNA3_DEATH_PENALTY} (ต่ำสุด 0)`,
        en: `End the battle with nobody having died — ${V045_LUNA3_BASE_POINTS} points, less ${V045_LUNA3_DEATH_PENALTY} per death, floored at 0`,
      },
    },
  ],
};

/** v0.4.5 passives. Same PassiveIds as v0.3 for Eric and Liora (the trait is recognisably the same
 *  one, restated); Luna's is a genuinely different trait and takes a new id. */
export const V045_PASSIVES: Partial<Record<CharId, PassiveDef>> = {
  Eric: {
    id: 'Berserk',
    charId: 'Eric',
    name: { th: 'Berserk', en: 'Berserk' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: ขณะ HP ต่ำกว่าครึ่งของ HP สูงสุด พลังโจมตีของ Eric ทุกครั้ง +4 (เช็คในเวลาที่การโจมตีเกิดผล; สกิล ⚡ จึงเช็คตอนประกาศ)',
      en: "Always active: while Eric's HP is below half his maximum, every attack deals +4 (checked when the hit takes effect, so ⚡ skills check on declare).",
    },
  },
  Liora: {
    id: 'ManaCharge',
    charId: 'Liora',
    name: { th: 'ManaCharge', en: 'ManaCharge' },
    desc: {
      th: `ทำงานเองตลอดเวลา: จ่ายมานา 1 หน่วยเพื่อเพิ่มพลังโจมตีเวทย์ +${V045_AURASHIELD_DEF_PER_MANA} หรือเพิ่มเกราะของ Aura Shield +${V045_AURASHIELD_DEF_PER_MANA} (เก็บมานาได้สูงสุด ${V045_LIORA_MANA_MAX} · มานาได้จาก Mana Drain เท่านั้น)`,
      en: `Always active: spend 1 mana for +${V045_AURASHIELD_DEF_PER_MANA} spell damage, or for +${V045_AURASHIELD_DEF_PER_MANA} armor on an Aura Shield (cap ${V045_LIORA_MANA_MAX} mana; Mana Drain is the only source).`,
    },
  },
  Luna: {
    id: 'DivineTithe',
    charId: 'Luna',
    name: { th: 'ส่วนสิบศักดิ์สิทธิ์', en: 'Divine Tithe' },
    desc: {
      th: `ทำงานเองตลอดเวลา: การโจมตีบอสครั้งใดที่ทำดาเมจถึง ${V045_LUNA_MANA_PER_BOSS_DAMAGE} Luna ได้มานา +1 (ถึง ${V045_LUNA_MANA_PER_BOSS_DAMAGE * 2} ได้ +2 ไปเรื่อยๆ) — คิดแยกทีละครั้ง ไม่สะสมและไม่ทบไปครั้งหน้า · เริ่มยกด้วยมานา ${V045_LUNA_START_MANA} · ไม่มีเพดาน · ล้างทุกยกบอส · และเธอยังคงปัดป้องสถานะผิดปกติจากท่าบอสที่เล็งเธอคนเดียวได้เสมอ (ท่าที่ตีทุกคนยังติดปกติ)`,
      en: `Always active: any single hit on the boss that deals ${V045_LUNA_MANA_PER_BOSS_DAMAGE} damage gives Luna 1 mana (${V045_LUNA_MANA_PER_BOSS_DAMAGE * 2} gives 2, and so on) — each hit is judged on its own, with nothing accumulated and no remainder carried forward. She opens each battle with ${V045_LUNA_START_MANA} mana; there is no cap, and it is wiped between battles. She also still shrugs off any ailment from a boss move that singles her out — an attack that hits everyone still lands.`,
    },
  },
};

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
export function scorePoints(conditionId: string, ruleset: RulesetVersion = STABLE_RULESET): number {
  // ALL_CHAR_IDS, not CHAR_IDS: v0.4.0's three characters are outside the bot-facing pool but
  // their conditions still have to resolve whenever a human is playing one.
  for (const charId of ALL_CHAR_IDS) {
    const c = charScore(charId, ruleset).find((s) => s.id === conditionId);
    if (c) return c.points;
  }
  throw new Error(`unknown score condition: ${conditionId}`);
}

// ══════════════════════ v0.4.0 tuning constants ══════════════════════
// All of these are first-guess numbers. Nothing here has been through a balance sim — the three
// v0.4.0 characters are human-only precisely because the sim cannot price them (bots value skills
// by damage-per-⏱ and cannot see sand, shadow, souls, stealth, or a marker rewind at all).

/** Chrono: sand cap, the ⏱ bar a declare must meet to bank sand, and what Rewind costs.
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

/** chrono3's clock bar, and how far Haste drags an ally up the clock (read off the skill's
 *  `primary`, this is only the ceiling used for validation). */
export const CHRONO_TIME_LEFT_BAR = 8;

/** Which characters may only ever be taken by a human seat, and only in the v0.4.0 ruleset. */
export function isHumanOnlyCharacter(charId: CharId): boolean {
  return V040_CHAR_IDS.includes(charId);
}

/** morvane3's bar — "alive, but only just". Harsher than eric3's half-HP latch on purpose: he is
 *  the one character Heal cannot touch, so finishing a battle this low is a real achievement rather
 *  than an accident. */
export const MORVANE_LOW_HP_BAR = 4;
