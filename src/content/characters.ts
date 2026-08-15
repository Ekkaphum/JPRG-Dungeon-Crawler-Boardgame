// v0.3.0 "clock" ruleset — character + skill data. Source of truth: ../../GAME_DESIGN_v0_3_0.md §8.
// Lv2 numbers are NOT in the source doc — see docs/10-v0.3.0-rulings.md §1 for the extrapolation
// rule (~35-50% power bump) used to fill them in so the EXP/level system has real weight.

// Dax/Mira (2026-08-11): added to make the draft pool bigger than the table so the last pick is
// never forced. Temporarily disabled (2026-08-12) — GAME_DESIGN.md/README still describe a
// 4-character roster (4 character sheets, 12 skill cards, Aurelius's armor-break combo analysis
// assuming Kit+Luna+Vera are all at the table), and having them silently draftable contradicted
// that document. Their data/skills/score conditions and all engine support stay in place — this is
// the only line that needs to change to re-enable them once the docs are updated to match, or a
// content pass reconciles the two. See docs/BALANCE_NOTES.md.
export type CharId = 'Matt' | 'Kit' | 'Vera' | 'Luna' | 'Dax' | 'Mira';
export const CHAR_IDS: CharId[] = ['Matt', 'Kit', 'Vera', 'Luna'];
/** Full roster including disabled characters — for anything that must enumerate every CharId
 *  regardless of draft availability (Record<CharId,...> exhaustiveness, tests). Never use this for
 *  the draft pool itself; that's CHAR_IDS above. */
export const ALL_CHAR_IDS: CharId[] = ['Matt', 'Kit', 'Vera', 'Luna', 'Dax', 'Mira'];

export type SkillId =
  // Matt
  | 'Slash'
  | 'PowerStrike'
  | 'Guard'
  | 'CounterAttack'
  // Kit
  | 'QuickShot'
  | 'SharpShooting'
  | 'Trap'
  | 'MultiShot'
  // Vera
  | 'AirPush'
  | 'Fireball'
  | 'AuraCharge'
  | 'Meteor'
  // Luna
  | 'Hitting'
  | 'AuraSmite'
  | 'Blessing'
  | 'Heal'
  // Dax / Mira — unchanged by the v0.4.0 redesign, still content-complete but excluded from
  // CHAR_IDS (see the comment on ALL_CHAR_IDS above).
  | 'Flurry'
  | 'Riposte'
  | 'Focus'
  | 'FrostBolt'
  | 'ArcaneWard'
  | 'MendingWind';

/** Which resolution family a skill belongs to — see docs/RULINGS.md §5. */
export type SkillKind =
  | 'attack' // Slash, Power Strike, Quick Shot, Air Push, Hitting, Aura Smite, Twin Shot, Smite — plain damage to boss, resolves next visit
  | 'attackGated' // (unused since v0.4.0 — Matt's HP-gated damage is now the always-on Berserk passive instead of a per-skill tier)
  | 'attackRoll' // Sharp Shooting, Focus — attack + dice roll → weak point buff, resolves next visit
  | 'attackMana' // Fireball, Meteor, Frost Bolt — attack scaled by mana paid, resolves next visit
  | 'multiHit' // Multi Shot — one hit at resolve + extra hits scheduled at earlier slots (see earlyHits)
  | 'heal' // Heal, Mending Wind — targeted heal, resolves next visit
  | 'buffCounter' // Counter Attack, Riposte — immediate self-shield + conditional counter-strike
  | 'buffParty' // Blessing — immediate party-wide atk/defense buff
  | 'buffMana' // Aura Charge, Arcane Ward — immediate self-shield; Vera's own mana gain comes from her ManaCharge passive, not this
  | 'guard' // Guard — immediate damage-redirect link from an ally onto the caster
  | 'trap'; // Trap!, Set Trap — immediate token placement

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

export type PassiveId = 'Berserk' | 'SkillImprovement' | 'ManaCharge' | 'HolyWater';

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
  Matt: {
    id: 'Berserk',
    charId: 'Matt',
    name: { th: 'Berserk', en: 'Berserk' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: ขณะ HP ต่ำกว่า 7 พลังโจมตีของ Matt ทุกครั้ง +4 (เช็คในเวลาที่การโจมตีเกิดผล; สกิล ⚡ จึงเช็คตอนประกาศ)',
      en: "Always active: while Matt's HP is below 7, every attack deals +4 (checked when the hit takes effect, so ⚡ skills check on declare).",
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
  Vera: {
    id: 'ManaCharge',
    charId: 'Vera',
    name: { th: 'ManaCharge', en: 'ManaCharge' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: ทุกครั้งที่ Vera ประกาศแอคชันที่ไม่สร้างดาเมจให้บอส (เช่น Aura Charge) เธอได้มานา +1 (สูงสุด 3) — Fireball/Meteor จ่ายมานานี้ได้ +3 ดาเมจต่อหน่วย',
      en: "Always active: whenever Vera declares a non-damaging action (Aura Charge), she gains +1 mana (cap 3) — Fireball/Meteor spend it for +3 damage per point.",
    },
  },
  Luna: {
    id: 'HolyWater',
    charId: 'Luna',
    name: { th: 'HolyWater', en: 'Holy Water' },
    desc: {
      th: 'ทำงานเองตลอดเวลา: เมื่อบอสโจมตี Luna โดยตรง (ท่าเดี่ยว ไม่ใช่ AoE) สถานะผิดปกติที่ท่านั้นจะติดให้เธอถูกยกเลิกทันที — ยังไม่มีท่าบอสใดในเนื้อหาปัจจุบันที่ติดสถานะผิดปกติ ดังนั้นตอนนี้ยังไม่มีผลจริงในเกม แต่กลไกพร้อมรองรับบอสในอนาคต',
      en: "Always active: when the boss hits Luna with a single-target move, any debuff status it would apply to her is cancelled — no boss move in the current 3-boss content actually applies one, so this has no observable effect yet, but the hook is wired for future boss content.",
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
    charId: 'Matt',
    kind: 'attack',
    immediate: true,
    name: { th: 'Slash', en: 'Slash' },
    lv1: { time: 2, primary: 3 },
    lv2: { time: 2, primary: 4 },
  },
  PowerStrike: {
    id: 'PowerStrike',
    charId: 'Matt',
    kind: 'attack',
    immediate: true,
    name: { th: 'Power Strike', en: 'Power Strike' },
    lv1: { time: 4, primary: 6 },
    lv2: { time: 4, primary: 9 },
  },
  Guard: {
    id: 'Guard',
    charId: 'Matt',
    kind: 'guard',
    name: { th: 'Guard', en: 'Guard' },
    // primary = flat reduction on damage redirected onto Matt. No more `secondary`/wardAtk (the
    // ward no longer gets an attack buff) — the redesign frames Guard as pure protection: Matt
    // takes the hit instead of them, full stop.
    lv1: { time: 5, primary: 4 },
    lv2: { time: 5, primary: 6 },
  },
  CounterAttack: {
    id: 'CounterAttack',
    charId: 'Matt',
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
    // On a successful roll, every player's attacks on the boss deal +4 until the boss next acts —
    // reuses the same weakPointActive flag the old Quick Shot set.
    lv1: { time: 3, primary: 5, rollBaseTarget: 5 },
    lv2: { time: 3, primary: 7, rollBaseTarget: 4 },
  },
  Trap: {
    id: 'Trap',
    charId: 'Kit',
    kind: 'trap',
    name: { th: 'Trap!', en: 'Trap!' },
    // Armed on one of the 3 slots ahead of Kit's own pawn (legalTrapSlots derives this from `time`
    // — 4 gives exactly 3 legal slots, marker-1..marker-3). On a hit: `primary` damage (ignores
    // armor) and, on a successful roll, the boss's queued move is cancelled outright.
    // Lv1 rollBaseTarget 6 -> 5 (v0.3.8), Lv2 deliberately left at 5. Measured: Kit's *placement* is
    // essentially never the problem — the boss stopped on the armed slot 99.4% of the time — but the
    // trigger roll passed only 35.3%, so kit2 fired 0.12 times per win, and the Skill Improvement
    // penalty never accumulated enough to help (Trap is declared ~0.4 times per game, so its counter
    // barely moves). The roll stays the gate on purpose: springing a trap cancels the boss's entire
    // declared move, the single most powerful party-wide effect in the ruleset, so it must not become
    // reliable — this makes the lottery less punishing without removing it. Changed as one isolated
    // variable so the sim measures this and nothing else; that leaves Lv2 giving damage (5 -> 7) but
    // no roll improvement, which is a known, accepted consequence rather than an oversight.
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
    charId: 'Vera',
    kind: 'attack',
    immediate: true,
    name: { th: 'Air Push', en: 'Air Push' },
    lv1: { time: 2, primary: 2 },
    lv2: { time: 2, primary: 3 },
  },
  Fireball: {
    id: 'Fireball',
    charId: 'Vera',
    kind: 'attackMana',
    name: { th: 'Fireball', en: 'Fireball' },
    // primary = base damage, secondary = damage per mana point. Mana itself comes from Vera's
    // ManaCharge passive (see PASSIVES), not from anything Fireball does.
    lv1: { time: 3, primary: 5, secondary: 3 },
    lv2: { time: 3, primary: 8, secondary: 3 },
  },
  AuraCharge: {
    id: 'AuraCharge',
    charId: 'Vera',
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
    charId: 'Vera',
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

  // Dax — Duelist. Only uses skill kinds the engine already treats generically (attack,
  // buffCounter, attackRoll) so no new mechanic had to be added — see the CharId comment above.
  Flurry: {
    id: 'Flurry',
    charId: 'Dax',
    kind: 'attack',
    name: { th: 'Flurry', en: 'Flurry' },
    // primary = damage per hit, secondary = hit count (same shape as Kit's Twin Shot)
    lv1: { time: 5, primary: 3, secondary: 3 },
    lv2: { time: 5, primary: 4, secondary: 3 },
  },
  Riposte: {
    id: 'Riposte',
    charId: 'Dax',
    kind: 'buffCounter',
    name: { th: 'Riposte', en: 'Riposte' },
    // A lighter parry than Matt's Counter Attack: less damage reduction and a smaller riposte,
    // but ⏱4 instead of ⏱5.
    lv1: { time: 4, primary: 40, secondary: 8 },
    lv2: { time: 4, primary: 45, secondary: 12 },
  },
  Focus: {
    id: 'Focus',
    charId: 'Dax',
    kind: 'attackRoll',
    name: { th: 'Focus', en: 'Focus' },
    // A second weak-point opener alongside Kit's Quick Shot — ⏱4 (a slot slower) for slightly
    // more base damage, so the party isn't dead in the water if Kit isn't at the table.
    lv1: { time: 4, primary: 5, rollBaseTarget: 5 },
    lv2: { time: 4, primary: 7, rollBaseTarget: 4 },
  },

  // Mira — Elementalist. A "battle medic": her own Heal is deliberately a notch weaker/slower than
  // Luna's dedicated one, and her attack is a cheaper, lower-scaling Fireball — she can cover for a
  // missing healer or a missing mage, but isn't strictly better than either specialist.
  FrostBolt: {
    id: 'FrostBolt',
    charId: 'Mira',
    kind: 'attackMana',
    name: { th: 'Frost Bolt', en: 'Frost Bolt' },
    lv1: { time: 4, primary: 4, secondary: 2 },
    lv2: { time: 4, primary: 6, secondary: 2 },
  },
  ArcaneWard: {
    id: 'ArcaneWard',
    charId: 'Mira',
    kind: 'buffMana',
    name: { th: 'Arcane Ward', en: 'Arcane Ward' },
    // primary = mana gained, secondary = incoming-damage reduction (flat). Reduction raised to
    // match Vera's ManaCharge (2026-08-11): the original, weaker numbers made Mira noticeably more
    // likely to die than Vera despite 1 more base HP — mira3 ("never died") fired at 0.24/win vs
    // vera3's 1.30/win in a 3000-game sim. See docs/BALANCE_NOTES.md.
    lv1: { time: 3, primary: 1, secondary: 3 },
    lv2: { time: 3, primary: 1, secondary: 5 },
  },
  MendingWind: {
    id: 'MendingWind',
    charId: 'Mira',
    kind: 'heal',
    name: { th: 'Mending Wind', en: 'Mending Wind' },
    // ⏱5 -> ⏱4 (2026-08-11): matching Luna's Heal speed while keeping a lower heal amount (5 vs 6)
    // for differentiation — the slower ⏱ was compounding with the smaller amount to make this
    // strictly worse in every comparison, so bots essentially never chose it (0.06 fires/win).
    lv1: { time: 4, primary: 5 },
    lv2: { time: 4, primary: 8 },
  },
};

export const CHARACTERS: Record<CharId, CharacterDef> = {
  Matt: {
    id: 'Matt',
    job: { th: 'Knight', en: 'Knight' },
    hp: 16,
    startSlot: 23,
    reviveHp: 8,
    // v0.4.0: common attack + 3 cards, plus the always-on Berserk passive (PASSIVES.Matt).
    skills: ['Slash', 'PowerStrike', 'Guard', 'CounterAttack'],
    score: [
      {
        id: 'matt1',
        charId: 'Matt',
        slot: 1,
        points: 1,
        perOccurrence: true,
        desc: { th: 'ทำ dmg ครั้งเดียวได้มากกว่า 10', en: 'Deal more than 10 damage in one hit' },
      },
      {
        id: 'matt2',
        charId: 'Matt',
        slot: 2,
        points: 2,
        perOccurrence: true,
        // v0.3.7: was "Land the Last Shot" (3pts), which is now the universal LAST_SHOT_POINTS bonus
        // every character earns. Matt's protector role — the whole point of Guard — previously scored
        // nothing at all despite Guard being declared ~1,800 times per 3,000 sim games.
        desc: { th: 'ปกป้องเพื่อนสำเร็จ — Guard รับดาเมจแทนเพื่อน', en: 'Guard successfully takes a hit aimed at an ally' },
      },
      {
        id: 'matt3',
        charId: 'Matt',
        slot: 3,
        points: 3,
        perOccurrence: false,
        // v0.3.7: was "end the battle with HP below 5 (and alive)" — fired 0.13 times per win, i.e.
        // effectively dead, and it fought Berserk (which wants low HP *while attacking*, not at the
        // final frame). This asks about the battle's history instead: he took the beating and stayed
        // standing, which is the shonen fantasy stated as a rule.
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
        points: 1,
        perOccurrence: true,
        desc: { th: 'เปิดจุดอ่อนสำเร็จ', en: 'Successfully open a weak point' },
      },
      {
        id: 'kit2',
        charId: 'Kit',
        slot: 2,
        // 1 -> 2 (v0.3.8). The condition itself is right and stays as-is: the trap has to actually
        // spring. But its frequency is effectively fixed — the boss stops on the armed slot 99.4% of
        // the time, so the only variable is the trigger roll, and that is already governed by Kit's
        // Skill Improvement passive rather than by anything tunable here (lowering the base 6 -> 5
        // moved the success rate only 35.3% -> 38.8%). With frequency locked at ~0.13 fires per win,
        // point value is the one lever left, and kit2 was contributing 1% of Kit's score.
        points: 2,
        perOccurrence: true,
        desc: { th: 'กับดักทำงานสำเร็จ', en: 'A trap successfully triggers' },
      },
      {
        id: 'kit3',
        charId: 'Kit',
        slot: 3,
        // Raised to 3 alongside the 5 -> 8 bar, then measured back down to 2: at 8 attacks it fires
        // ~0.96 times per win instead of 2.75, so 3 points made it a rare *spike* and Kit's win
        // share jumped to 41.5%. Rarer and cheaper keeps it a goal without making him the runaway.
        points: 2,
        perOccurrence: false,
        // v0.3.7: bar raised 5 -> 8 and value 2 -> 3. Multi Shot lands 3 separate attacks from one
        // declare, so "5+" fired in 92% of battles — an automatic payout rather than a goal. 8 makes
        // the continuous-fire fantasy something Kit actually builds toward, and the extra point
        // raises his ceiling (he had the lowest score variance of the four, so he was consistently
        // 2nd/3rd and rarely won).
        desc: { th: 'จบยกบอสโดยโจมตีบอสไปแล้ว 8 ครั้งขึ้นไป', en: 'End the battle having attacked the boss 8+ times' },
      },
    ],
  },
  Vera: {
    id: 'Vera',
    job: { th: 'Wizard', en: 'Wizard' },
    hp: 11,
    startSlot: 23,
    reviveHp: 6,
    // ① Fireball ② ManaCharge ③ Meteor. Vera is the template's one sanctioned "supports only
    // herself" case (§8.0) — she is the payload the other three set up, not a setter-upper.
    // v0.4.0: common attack + 3 cards, plus the always-on ManaCharge passive (PASSIVES.Vera).
    skills: ['AirPush', 'Fireball', 'AuraCharge', 'Meteor'],
    score: [
      {
        id: 'vera1',
        charId: 'Vera',
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
        id: 'vera2',
        charId: 'Vera',
        slot: 2,
        // 2 -> 1: this fires on the *same hit* as vera1 most of the time (a 2-mana Meteor is
        // 19 damage, comfortably over vera1's 14), so at 2 points one action was paying her 3 and
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
        id: 'vera3',
        charId: 'Vera',
        slot: 3,
        // 3 -> 2: at 3 this was the single largest personal payout in the game (7.38 pts/win under
        // competitive play, against Matt's biggest at 5.20).
        points: 2,
        perOccurrence: false,
        // v0.3.7: was a bare "end the battle without dying" (2pts) — at a 91.5% win rate that fired
        // in 82% of battles and made up 39% of her score for doing nothing in particular, which is
        // most of why she won 40.9% of games against Matt's 8.8%. Surviving now only pays when she
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
        // 1 -> 3 (2026-08-11): with comboSynergyBonus now steering Luna toward Blessing whenever a
        // teammate's big hit is lining up, Heal was barely worth declaring — balance sim showed it
        // contributing under 3% of her total score in won games, next to nothing next to luna3's
        // ~50%. Bots don't pick Heal for its point value (estimateChoiceValue's heal case is purely
        // HP-need-driven; scoreConditionBonus doesn't touch luna1 at all), so this fire rate is a
        // fixed multiplier — 2x wasn't enough to move Luna's total meaningfully (+0.1 pts/win over
        // 4000 games); 3x still leaves it well under matt3's contribution at the same frequency
        // scale. See docs/BALANCE_NOTES.md for the tested progression.
        points: 3,
        perOccurrence: true,
        desc: { th: 'ใช้ Heal แล้วฟื้น HP ให้เพื่อนได้จริงอย่างน้อย 1 แต้ม', en: 'Heal restores at least 1 HP to an injured ally' },
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
        points: 2,
        perOccurrence: false,
        desc: { th: 'จบยกบอสโดยไม่มีใครในวงตายเลย', en: 'End the battle with no party member ever dying' },
      },
    ],
  },
  Dax: {
    id: 'Dax',
    job: { th: 'Duelist', en: 'Duelist' },
    hp: 11,
    startSlot: 21,
    reviveHp: 5,
    // ① Flurry ② Focus (a second weak-point opener) ③ Riposte.
    skills: ['Flurry', 'Focus', 'Riposte'],
    score: [
      {
        id: 'dax1',
        charId: 'Dax',
        slot: 1,
        points: 1,
        perOccurrence: true,
        desc: { th: 'เปิดจุดอ่อนสำเร็จด้วย Focus', en: 'Successfully open a weak point with Focus' },
      },
      {
        id: 'dax2',
        charId: 'Dax',
        slot: 2,
        points: 1,
        perOccurrence: true,
        desc: { th: 'สวนกลับด้วย Riposte แล้วดาเมจเข้าจริง', en: 'A Riposte counter-strike lands real damage' },
      },
      {
        id: 'dax3',
        charId: 'Dax',
        slot: 3,
        points: 2,
        perOccurrence: false,
        desc: { th: 'จบยกบอสด้วย HP มากกว่าครึ่ง', en: 'End the battle above half HP' },
      },
    ],
  },
  Mira: {
    id: 'Mira',
    job: { th: 'Elementalist', en: 'Elementalist' },
    hp: 9,
    startSlot: 20,
    reviveHp: 4,
    // ① Frost Bolt ② Mending Wind ③ Arcane Ward — but ③ is a template violation, not a signature:
    // Arcane Ward is `buffMana` with the same numbers as Vera's ManaCharge, so Mira has nothing
    // that is *hers*. This is the same character the sim already flags as the roster's outlier
    // (0.99 pts/win vs. everyone else's 5-8, docs/BALANCE_NOTES.md) — the role template (§8.0) and
    // the balance data agree, and she stays out of CHAR_IDS until she has a real slot ③.
    skills: ['FrostBolt', 'MendingWind', 'ArcaneWard'],
    score: [
      {
        id: 'mira1',
        charId: 'Mira',
        slot: 1,
        points: 2,
        perOccurrence: true,
        desc: { th: 'ใช้ Mending Wind แล้วฟื้น HP ให้เพื่อนได้จริงอย่างน้อย 1 แต้ม', en: 'Mending Wind restores at least 1 HP to an injured ally' },
      },
      {
        id: 'mira2',
        charId: 'Mira',
        slot: 2,
        points: 1,
        perOccurrence: true,
        desc: { th: 'ทำ dmg ครั้งเดียวได้มากกว่า 10 ด้วย Frost Bolt', en: 'Deal more than 10 damage in one hit with Frost Bolt' },
      },
      {
        id: 'mira3',
        charId: 'Mira',
        slot: 3,
        // Replaced the original "end with mana banked" condition entirely (2026-08-11), after
        // trying >=2 and >=1 mana thresholds both landed near 0.01-0.05 fires/win in a 3000-game
        // sim: attackMana's value estimate always rewards spending more mana with nothing modeling
        // a reason to hold back, so bots almost never end a battle with any banked regardless of
        // the bar. Switched to survival, the same condition shape that already performs well for
        // Vera (vera3, ~49% of her total) — Mira is nearly as fragile (9 HP vs Vera's 8).
        points: 2,
        perOccurrence: false,
        desc: { th: 'จบยกบอสโดยไม่ตาย', en: 'End the battle without dying' },
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
 *  Matt (matt2) and Vera (vera2) had, so Kit and Luna scored nothing for the same act — measured at
 *  a 4.6x win-share gap between Vera and Matt (docs/BALANCE_NOTES.md). Kept out of CHARACTERS[].score
 *  on purpose: it belongs to no one character, and the end-of-game breakdown groups it the same way
 *  'timeBonus' is grouped. */
export const LAST_SHOT_POINTS = 2;
export const LAST_SHOT_CONDITION_ID = 'lastShot';

/** Mana Vera must commit to a single spell for vera2 to score. Every point of mana costs her a whole
 *  turn on Aura Charge (the ManaCharge passive is the only source), so 2 already means she spent two
 *  turns setting up one cast. Set to 3 at first and measured at 0.00 fires per win across 3,000
 *  games — nobody ever banks that long — see docs/BALANCE_NOTES.md. */
export const VERA_CHARGED_CAST_MANA = 2;

/** Vera's "one big impact" bar — scores vera1 on every hit that reaches it, and latches the half of
 *  vera3 that asks whether she actually delivered this battle. One threshold, both conditions. */
export const VERA_BIG_HIT_DAMAGE = 14;

/** Single source of truth for a personal score condition's point value — scoring.ts's pushScore()
 *  calls read through this instead of repeating the number, so a rebalance only ever needs to
 *  change it here. (Doesn't cover 'timeBonus'/'lastShot', which aren't personal conditions — the
 *  first is computed from the clock's remaining slots, the second is the flat bonus above.) */
export function scorePoints(conditionId: string): number {
  // ALL_CHAR_IDS, not CHAR_IDS: this must keep resolving Dax/Mira's own condition ids even while
  // they're excluded from the draft pool, since their content/tests still exist independently of
  // whether the pool offers them.
  for (const charId of ALL_CHAR_IDS) {
    const c = CHARACTERS[charId].score.find((s) => s.id === conditionId);
    if (c) return c.points;
  }
  throw new Error(`unknown score condition: ${conditionId}`);
}
