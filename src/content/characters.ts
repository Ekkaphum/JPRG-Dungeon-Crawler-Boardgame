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
  | 'Slash'
  | 'Guard'
  | 'CounterAttack'
  | 'QuickShot'
  | 'SetTrap'
  | 'TwinShot'
  | 'Fireball'
  | 'Meteor'
  | 'ManaCharge'
  | 'Heal'
  | 'Blessing'
  | 'Smite'
  | 'Flurry'
  | 'Riposte'
  | 'Focus'
  | 'FrostBolt'
  | 'ArcaneWard'
  | 'MendingWind';

/** Which resolution family a skill belongs to — see docs/RULINGS.md §5. */
export type SkillKind =
  | 'attack' // Twin Shot, Smite — plain damage to boss, resolves next visit
  | 'attackGated' // Slash — attack whose damage steps up while a self-condition holds
  | 'attackRoll' // Quick Shot — attack + dice ladder → weak point debuff, resolves next visit
  | 'attackMana' // Fireball, Meteor — attack scaled by mana paid, resolves next visit
  | 'heal' // Heal — targeted heal, resolves next visit
  | 'buffCounter' // Counter Attack — immediate self-shield + conditional counter-strike
  | 'buffParty' // Blessing — immediate party-wide atk/defense buff
  | 'buffMana' // ManaCharge — immediate mana gain + self-shield
  | 'guard' // Guard — immediate damage-redirect link from an ally onto the caster
  | 'trap'; // Set Trap — immediate token placement

export interface SkillLevelStats {
  time: number;
  /** Meaning depends on the skill: flat damage, heal amount, trap damage, dmg reduction, etc. */
  primary?: number;
  /** Also overloaded per kind: hit count (attack), damage per mana (attackMana), riposte damage
   *  (buffCounter), and — for `attackGated` — the *boosted* damage used while the gate holds. */
  secondary?: number;
  /** Quick Shot only — dice-ladder starting target (5 normally, 4 at Lv2). */
  rollBaseTarget?: number;
}

export interface SkillDef {
  id: SkillId;
  charId: CharId;
  kind: SkillKind;
  name: { th: string; en: string };
  lv1: SkillLevelStats;
  lv2: SkillLevelStats;
}

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
  Slash: {
    id: 'Slash',
    charId: 'Matt',
    kind: 'attackGated',
    name: { th: 'Slash', en: 'Slash' },
    // v0.3.2: Berserk was folded into Slash as a damage tier rather than kept as a separate card,
    // so Matt's slot ① holds one attack instead of two and slot ② is free for Guard (see the role
    // template in GAME_DESIGN.md §8.0). primary = normal damage, secondary = the "ยิ่งใกล้ตายยิ่งแรง"
    // damage while HP <= 5. secondary stays at 11 on purpose: matt1 scores on "more than 10 damage
    // in one hit", so anything lower would put Matt's own slot-① condition out of reach unbuffed.
    lv1: { time: 4, primary: 6, secondary: 11 },
    lv2: { time: 4, primary: 9, secondary: 16 },
  },
  Guard: {
    id: 'Guard',
    charId: 'Matt',
    kind: 'guard',
    name: { th: 'Guard', en: 'Guard' },
    // primary = flat reduction on damage redirected onto Matt · secondary = attack buff handed to
    // the warded ally. Both were forced by measurement, not taste (docs/BALANCE_NOTES.md):
    //
    //  - A *pure* redirect (reduction 0) made the party strictly worse off. A redirect doesn't
    //    lower incoming damage, it concentrates it onto one 16 HP body instead of four pools, so it
    //    killed Matt more than it saved anyone: luna3 ("nobody died") fell 0.94 → 0.54 fires/game
    //    and total boss damage *rose*. `primary` is what makes eating a hit cost the boss something.
    //  - Even mitigated, a zero-offence card could not pay its own ⏱. Every other character's slot ②
    //    feeds the damage economy — Quick Shot deals damage while opening the weak point, Blessing
    //    multiplies the whole party, ManaCharge banks damage for later — and Matt's was the only one
    //    producing nothing at all, which cost the party ~11 damage/battle it does not have (§10).
    //    `secondary` is the fix, and it is the Knight fantasy stated mechanically: the ally you are
    //    covering can swing freely. Distinct from Blessing on purpose (one target, and it comes
    //    bundled with absorption, vs. party-wide with none) per the §8.0 no-duplicate-kinds rule.
    //
    // ⏱5, not 4, for two reasons beyond flavour: it keeps Matt's kit average at 4.33 exactly where
    // v0.3.1's speed realignment put it (Kit 3.67 < Luna 4.00 < Matt 4.33 < Vera 5.00), and it
    // steps into the ⏱>=5 bracket Somnivar taxes — which Berserk just vacated by being folded into
    // Slash's ⏱4.
    lv1: { time: 5, primary: 4, secondary: 3 },
    lv2: { time: 5, primary: 6, secondary: 4 },
  },
  CounterAttack: {
    id: 'CounterAttack',
    charId: 'Matt',
    kind: 'buffCounter',
    name: { th: 'Counter Attack', en: 'Counter Attack' },
    // primary = incoming-damage reduction %, secondary = counter-strike damage
    // ⏱5 -> 4 (2026-08-13): part of the equal-start speed realignment — see docs/BALANCE_NOTES.md.
    lv1: { time: 4, primary: 50, secondary: 12 },
    lv2: { time: 4, primary: 50, secondary: 17 },
  },
  QuickShot: {
    id: 'QuickShot',
    charId: 'Kit',
    kind: 'attackRoll',
    name: { th: 'Quick Shot', en: 'Quick Shot' },
    lv1: { time: 3, primary: 4, rollBaseTarget: 5 },
    lv2: { time: 3, primary: 6, rollBaseTarget: 4 },
  },
  SetTrap: {
    id: 'SetTrap',
    charId: 'Kit',
    kind: 'trap',
    name: { th: 'Set Trap', en: 'Set Trap' },
    // Armed somewhere inside the skill's own ⏱ window; on a hit it deals `primary` and rolls the
    // same escalating ladder Quick Shot uses to cancel the boss's declared move.
    lv1: { time: 4, primary: 4, rollBaseTarget: 5 },
    lv2: { time: 4, primary: 6, rollBaseTarget: 4 },
  },
  TwinShot: {
    id: 'TwinShot',
    charId: 'Kit',
    kind: 'attack',
    name: { th: 'Twin Shot', en: 'Twin Shot' },
    // primary = damage per hit, secondary = hit count
    // ⏱5 -> 4 (2026-08-13): part of the equal-start speed realignment — see docs/BALANCE_NOTES.md.
    lv1: { time: 4, primary: 4, secondary: 2 },
    lv2: { time: 4, primary: 6, secondary: 2 },
  },
  Fireball: {
    id: 'Fireball',
    charId: 'Vera',
    kind: 'attackMana',
    name: { th: 'Fireball', en: 'Fireball' },
    // primary = base damage, secondary = damage per mana point
    lv1: { time: 3, primary: 5, secondary: 3 },
    lv2: { time: 3, primary: 8, secondary: 3 },
  },
  Meteor: {
    id: 'Meteor',
    charId: 'Vera',
    kind: 'attackMana',
    name: { th: 'Meteor', en: 'Meteor' },
    lv1: { time: 7, primary: 13, secondary: 3 },
    lv2: { time: 7, primary: 18, secondary: 3 },
  },
  ManaCharge: {
    id: 'ManaCharge',
    charId: 'Vera',
    kind: 'buffMana',
    name: { th: 'ManaCharge', en: 'ManaCharge' },
    // primary = mana gained, secondary = incoming-damage reduction (flat)
    lv1: { time: 2, primary: 1, secondary: 3 },
    lv2: { time: 2, primary: 1, secondary: 5 },
  },
  Heal: {
    id: 'Heal',
    charId: 'Luna',
    kind: 'heal',
    name: { th: 'Heal', en: 'Heal' },
    lv1: { time: 4, primary: 6 },
    lv2: { time: 4, primary: 9 },
  },
  Blessing: {
    id: 'Blessing',
    charId: 'Luna',
    kind: 'buffParty',
    name: { th: 'Blessing', en: 'Blessing' },
    // primary = party atk buff, secondary = party dmg reduction (flat)
    lv1: { time: 4, primary: 3, secondary: 2 },
    lv2: { time: 4, primary: 4, secondary: 3 },
  },
  Smite: {
    id: 'Smite',
    charId: 'Luna',
    kind: 'attack',
    name: { th: 'Smite', en: 'Smite' },
    // ⏱3 dmg4 -> ⏱4 dmg6 (2026-08-13): part of the equal-start speed realignment — see
    // docs/BALANCE_NOTES.md. Damage raised alongside the ⏱ increase so it stays worth casting.
    lv1: { time: 4, primary: 6 },
    lv2: { time: 4, primary: 8 },
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
    // Role template order (GAME_DESIGN.md §8.0): ① attack, ② support, ③ signature.
    skills: ['Slash', 'Guard', 'CounterAttack'],
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
        points: 3,
        perOccurrence: false,
        desc: { th: 'เป็นคนตี Last Shot ปราบบอส', en: 'Land the Last Shot that defeats the boss' },
      },
      {
        id: 'matt3',
        charId: 'Matt',
        slot: 3,
        points: 2,
        perOccurrence: false,
        desc: { th: 'จบยกบอสด้วย HP ต่ำกว่า 5 (และไม่ตาย)', en: 'End the battle with HP below 5 (and alive)' },
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
    skills: ['TwinShot', 'QuickShot', 'SetTrap'],
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
        points: 1,
        perOccurrence: true,
        desc: { th: 'กับดักทำงานสำเร็จ', en: 'A trap successfully triggers' },
      },
      {
        id: 'kit3',
        charId: 'Kit',
        slot: 3,
        points: 2,
        perOccurrence: false,
        desc: { th: 'จบยกบอสโดยโจมตีบอสไปแล้ว 5 ครั้งขึ้นไป', en: 'End the battle having attacked the boss 5+ times' },
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
    skills: ['Fireball', 'ManaCharge', 'Meteor'],
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
        points: 3,
        perOccurrence: false,
        // Broadened from Meteor-only to any of Vera's skills, and points cut 4 -> 3 to compensate
        // (2026-08-13). The identical broadening was tried and reverted on 2026-08-11 (see prior
        // note in git history) because it overshot Vera to the highest scorer at 3-4pts. Landing
        // it this time only as part of the larger equal-start/HP/⏱ rebalance pass — re-verify
        // Vera's total against the other three after any further change. docs/BALANCE_NOTES.md.
        desc: { th: 'เป็นคนตี Last Shot ปราบบอส', en: 'Land the Last Shot that defeats the boss' },
      },
      {
        id: 'vera3',
        charId: 'Vera',
        slot: 3,
        points: 2,
        perOccurrence: false,
        desc: { th: 'จบยกบอสโดยไม่ตาย', en: 'End the battle without dying' },
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
    skills: ['Smite', 'Blessing', 'Heal'],
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
        points: 3,
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

/** Single source of truth for a personal score condition's point value — scoring.ts's pushScore()
 *  calls read through this instead of repeating the number, so a rebalance only ever needs to
 *  change it here. (Doesn't cover 'timeBonus', which isn't a personal condition — it's computed
 *  dynamically from the clock's remaining slots and split equally among all four players.) */
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
