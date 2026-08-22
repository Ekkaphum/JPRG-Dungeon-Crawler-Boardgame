// v0.4.0 — status ailments the bosses inflict on players.
//
// Everything here is built on machinery the engine already had and was only using for one card
// each (docs/DESIGN_VARIABLES.md §2): `scheduledHits` writes damage onto future clock slots (Multi
// Shot), `expiresAtSlot` is a slot-counted timer (Blessing, weak point), and `applySomnivarTax`
// already knew how to add ⏱ to a declare (Somnivar's drowsy aura). No new timing concept is
// introduced — every ailment's lifetime is measured in clock slots, the same unit players already
// learned from Blessing's 4.
//
// This is also what finally gives Luna's Holy Water passive something to do. It has been wired
// since the original roster ("cancel a debuff a single-target boss move would apply to her") and
// did nothing for its entire life, because until now no boss move applied one.

export type AilmentId =
  | 'poison'
  | 'burn'
  | 'freeze'
  | 'daze'
  | 'blind'
  | 'silence'
  | 'bleed'
  | 'doom';

export interface AilmentDef {
  id: AilmentId;
  icon: string;
  name: { th: string; en: string };
  desc: { th: string; en: string };
  /** How many clock slots it lasts from the moment it lands. */
  slots: number;
  /** Highest number of copies that can sit on one fighter. 1 = re-applying refreshes instead. */
  maxStacks: number;
  /** True for ailments Somnivar is immune to and Aurelius resists — the "mental" family. Kept as a
   *  flag on the ailment rather than a list on each boss so a new boss only has to declare which
   *  families it ignores, not enumerate ids. */
  mental?: boolean;
  /** True for ailments that work on flesh — the family an elemental/golem body ignores. */
  physical?: boolean;
  /** Whether anything in the game can actually remove this early.
   *
   *  Added after the first v0.4.0 balance run: doom's own rules text has always read "unless it is
   *  cleansed first", but `cleanseAilments` had no caller anywhere, so doom was a delayed execution
   *  with no counterplay for any drafted character. It fired 2,221 times in 5,000 games — a 41% kill
   *  rate on the party's score leader. A lethal ailment has to have an answer; the flag exists so
   *  `ailmentBalance.test.ts` can hold future boss content to that rule rather than trusting prose. */
  cleansable?: boolean;
}

export const AILMENTS: Record<AilmentId, AilmentDef> = {
  poison: {
    id: 'poison',
    icon: '☠️',
    name: { th: 'พิษ', en: 'Poison' },
    // Ticks on the boss's clock rather than the victim's, so it punishes exactly the thing the
    // party cannot control: how often the boss gets to act.
    desc: {
      th: 'เสีย 2 HP ทุกครั้งที่บอสลงมือ · ซ้อนได้สูงสุด 3 ชั้น',
      en: 'Lose 2 HP every time the boss acts. Stacks up to 3.',
    },
    slots: 6,
    maxStacks: 3,
    physical: true,
  },
  burn: {
    id: 'burn',
    icon: '🔥',
    name: { th: 'ไหม้', en: 'Burn' },
    desc: {
      th: 'เสีย 3 HP ที่ตาถัดไปของตัวเอง · ติดซ้ำได้แต่ไม่ซ้อน (ต่ออายุแทน)',
      en: 'Lose 3 HP on your next visit. Re-applying refreshes rather than stacks.',
    },
    slots: 4,
    maxStacks: 1,
  },
  freeze: {
    id: 'freeze',
    icon: '❄️',
    name: { th: 'แช่แข็ง', en: 'Freeze' },
    desc: {
      th: 'สกิลถัดไปที่ประกาศใช้เวลา +2 ⏱',
      en: 'Your next declared skill costs +2 ⏱.',
    },
    slots: 6,
    maxStacks: 1,
  },
  daze: {
    id: 'daze',
    icon: '💫',
    name: { th: 'มึนงง', en: 'Daze' },
    desc: {
      th: 'สกิลถัดไปที่ประกาศใช้เวลา +1 ⏱ · ซ้อนได้ 2 ชั้น',
      en: 'Your next declared skill costs +1 ⏱. Stacks up to 2.',
    },
    slots: 5,
    maxStacks: 2,
    mental: true,
  },
  blind: {
    id: 'blind',
    icon: '👁️',
    name: { th: 'ตาบอด', en: 'Blind' },
    desc: {
      th: 'เกณฑ์ทอยเต๋าสูงขึ้น 1 (ทอยยากขึ้น)',
      en: 'Dice targets are 1 harder while this lasts.',
    },
    slots: 4,
    maxStacks: 1,
    mental: true,
  },
  silence: {
    id: 'silence',
    icon: '🔇',
    name: { th: 'เงียบ', en: 'Silence' },
    desc: {
      th: 'ห้ามประกาศสกิลที่ต้องจ่ายทรัพยากร (มานา/ทราย/เงา/วิญญาณ)',
      en: 'Cannot declare skills that spend a resource (mana, sand, shadow, souls).',
    },
    slots: 4,
    maxStacks: 1,
    mental: true,
  },
  bleed: {
    id: 'bleed',
    icon: '🩸',
    name: { th: 'เลือดไหล', en: 'Bleed' },
    // The mirror of poison: poison ticks on the boss's schedule, bleed ticks on yours, so acting
    // more often is the cost instead of the cure.
    desc: {
      th: 'เสีย 1 HP ทุกครั้งที่ถึงตาตัวเอง · ซ้อนได้สูงสุด 3 ชั้น',
      en: 'Lose 1 HP every time you are visited. Stacks up to 3.',
    },
    slots: 6,
    maxStacks: 3,
    physical: true,
  },
  doom: {
    id: 'doom',
    icon: '⏳',
    name: { th: 'นับถอยหลัง', en: 'Doom' },
    desc: {
      th: 'ล้มทันทีเมื่อครบ 8 ช่อง ถ้ายังไม่ถูกล้าง — ตัวล้างมี Aura Smite ของ Luna (v0.3) และน้ำมนต์จากค่ายพัก',
      en: 'You go down when the 8 slots run out unless cleansed. The cleanses are Luna\'s Aura Smite (v0.3 only) and the camp\'s Holy Water.',
    },
    slots: 8,
    maxStacks: 1,
    cleansable: true,
  },
};

/** One live ailment on one fighter. `expiresAtSlot` follows the same convention as Blessing and the
 *  weak point: the marker counts down, so the effect holds while `marker > expiresAtSlot`. */
export interface ActiveAilment {
  id: AilmentId;
  expiresAtSlot: number;
  stacks: number;
}

export function ailmentDef(id: AilmentId): AilmentDef {
  return AILMENTS[id];
}
