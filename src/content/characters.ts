// v0.3.0 "clock" ruleset — character + skill data. Source of truth: ../../GAME_DESIGN_v0_3_0.md §8.
// Lv2 numbers are NOT in the source doc — see docs/10-v0.3.0-rulings.md §1 for the extrapolation
// rule (~35-50% power bump) used to fill them in so the EXP/level system has real weight.

export type CharId = 'Matt' | 'Kit' | 'Vera' | 'Luna';
export const CHAR_IDS: CharId[] = ['Matt', 'Kit', 'Vera', 'Luna'];

export type SkillId =
  | 'Slash'
  | 'Berserk'
  | 'CounterAttack'
  | 'QuickShot'
  | 'SetTrap'
  | 'TwinShot'
  | 'Fireball'
  | 'Meteor'
  | 'ManaCharge'
  | 'Heal'
  | 'Blessing'
  | 'Smite';

/** Which resolution family a skill belongs to — see docs/10-v0.3.0-rulings.md §5. */
export type SkillKind =
  | 'attack' // Slash, Twin Shot, Smite — plain damage to boss, resolves next visit
  | 'attackGated' // Berserk — attack but re-checks a self-condition at resolve
  | 'attackRoll' // Quick Shot — attack + dice ladder → weak point debuff, resolves next visit
  | 'attackMana' // Fireball, Meteor — attack scaled by mana paid, resolves next visit
  | 'heal' // Heal — targeted heal, resolves next visit
  | 'buffCounter' // Counter Attack — immediate self-shield + conditional counter-strike
  | 'buffParty' // Blessing — immediate party-wide atk/defense buff
  | 'buffMana' // ManaCharge — immediate mana gain + self-shield
  | 'trap'; // Set Trap — immediate token placement

export interface SkillLevelStats {
  time: number;
  /** Meaning depends on the skill: flat damage, heal amount, trap damage, dmg reduction, etc. */
  primary?: number;
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
    kind: 'attack',
    name: { th: 'Slash', en: 'Slash' },
    lv1: { time: 4, primary: 6 },
    lv2: { time: 4, primary: 9 },
  },
  Berserk: {
    id: 'Berserk',
    charId: 'Matt',
    kind: 'attackGated',
    name: { th: 'Berserk', en: 'Berserk' },
    lv1: { time: 5, primary: 11 },
    lv2: { time: 5, primary: 16 },
  },
  CounterAttack: {
    id: 'CounterAttack',
    charId: 'Matt',
    kind: 'buffCounter',
    name: { th: 'Counter Attack', en: 'Counter Attack' },
    // primary = incoming-damage reduction %, secondary = counter-strike damage
    lv1: { time: 5, primary: 50, secondary: 12 },
    lv2: { time: 5, primary: 50, secondary: 17 },
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
    lv1: { time: 5, primary: 4, secondary: 2 },
    lv2: { time: 5, primary: 6, secondary: 2 },
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
    lv1: { time: 3, primary: 4 },
    lv2: { time: 3, primary: 6 },
  },
};

export const CHARACTERS: Record<CharId, CharacterDef> = {
  Matt: {
    id: 'Matt',
    job: { th: 'Knight', en: 'Knight' },
    hp: 16,
    startSlot: 20,
    reviveHp: 8,
    skills: ['Slash', 'Berserk', 'CounterAttack'],
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
    hp: 12,
    startSlot: 23,
    reviveHp: 6,
    skills: ['QuickShot', 'SetTrap', 'TwinShot'],
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
    hp: 8,
    startSlot: 20,
    reviveHp: 4,
    skills: ['Fireball', 'Meteor', 'ManaCharge'],
    score: [
      {
        id: 'vera1',
        charId: 'Vera',
        slot: 1,
        points: 1,
        perOccurrence: true,
        desc: { th: 'ทำ dmg ครั้งเดียวได้ 15 ขึ้นไป', en: 'Deal 15+ damage in one hit' },
      },
      {
        id: 'vera2',
        charId: 'Vera',
        slot: 2,
        points: 4,
        perOccurrence: false,
        desc: { th: 'ตี Last Shot ปราบบอสด้วย Meteor', en: 'Land the Last Shot with Meteor' },
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
    hp: 12,
    startSlot: 22,
    reviveHp: 6,
    skills: ['Heal', 'Blessing', 'Smite'],
    score: [
      {
        id: 'luna1',
        charId: 'Luna',
        slot: 1,
        points: 1,
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
};

export function skillDef(id: SkillId): SkillDef {
  return SKILLS[id];
}
export function skillStats(id: SkillId, isLv2: boolean): SkillLevelStats {
  const s = SKILLS[id];
  return isLv2 ? s.lv2 : s.lv1;
}
