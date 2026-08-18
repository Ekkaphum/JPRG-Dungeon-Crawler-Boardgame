import type { BattleState, Fighter } from '@engine/index';

export type StatusId =
  | 'weakPoint'
  | 'rage'
  | 'armor'
  | 'sleepAura'
  | 'counter'
  | 'manaShield'
  | 'blessing'
  | 'guarding'
  | 'guarded'
  | 'down'
  | 'pending';

export interface StatusDef {
  icon: string;
  tone: 'good' | 'bad' | 'neutral';
  label: { th: string; en: string };
  desc: { th: string; en: string };
}

/** Every status the board can show over a character's head, with the plain-language explanation
 *  shown in the detail modal. Keep this the single source — the badge row and the modal both read
 *  it, so an icon can never appear without an explanation behind it. */
export const STATUS_DEF: Record<StatusId, StatusDef> = {
  weakPoint: {
    icon: '⚡',
    tone: 'good',
    label: { th: 'จุดอ่อนเปิด', en: 'Weak Point' },
    desc: {
      th: 'ผู้เล่นทุกคนโจมตีแรงขึ้น +4 เป็นเวลา 4 ช่องนาฬิกา นับจากตอนที่เปิด',
      en: 'Every player deals +4 damage for 4 clock slots from the moment it opens.',
    },
  },
  rage: {
    icon: '🔥',
    tone: 'bad',
    label: { th: 'โทสะ (Rage)', en: 'Rage' },
    desc: {
      th: 'บอสได้ +1 ดาเมจต่อการถูกโจมตี 1 ครั้ง สะสมไปเรื่อยๆ และรีเซ็ตเป็น 0 ทันทีที่บอสลงมือ',
      en: 'The boss gains +1 damage each time it is hit; the stack is spent and reset to 0 when it acts.',
    },
  },
  armor: {
    icon: '🛡',
    tone: 'bad',
    label: { th: 'เกราะ', en: 'Armor' },
    desc: {
      th: 'ลดดาเมจที่เข้าทุกครั้ง (ยกเว้น Aura Smite และ Trap! ที่ไม่สนเกราะ) · ถ้าโดนดาเมจหลังหักเกราะแล้วเกิน 12 เกราะจะแตก -1 ถาวร',
      en: 'Reduces every incoming hit (except Aura Smite and Trap!, which ignore it). A hit dealing more than 12 after armor permanently breaks 1 point off.',
    },
  },
  sleepAura: {
    icon: '💤',
    tone: 'bad',
    label: { th: 'มนตร์ง่วงงุน', en: 'Drowsy Aura' },
    desc: {
      th: 'สกิลของผู้เล่นที่มี ⏱ 4-5 ต้องเดินหมากลงเพิ่ม 1 ช่อง · ⏱ 6 ขึ้นไปเพิ่ม 2 ช่อง (คิดตอนประกาศ)',
      en: 'Player skills at ⏱ 4-5 walk 1 extra slot down the clock; ⏱ 6+ walks 2 (applied when declared).',
    },
  },
  counter: {
    icon: '⚔️',
    tone: 'good',
    label: { th: 'Counter Attack', en: 'Counter Attack' },
    desc: {
      th: 'ดาเมจที่เข้าลดลงครึ่งหนึ่งทันที · ถ้าโดนตีระหว่างนี้ จะสวนกลับใส่บอสตอนถึงตาตัวเองรอบหน้า',
      en: 'Incoming damage is halved right now; if anything lands during the window, you strike back when your turn comes around.',
    },
  },
  manaShield: {
    icon: '💧',
    tone: 'good',
    label: { th: 'Mana Shield', en: 'Mana Shield' },
    desc: {
      th: 'ดาเมจที่เข้าลดลงแบบคงที่ จนถึงเทิร์นหน้าของตัวเอง (Liora ยังได้มานา +1 จากพาสซีฟ ManaCharge ด้วย)',
      en: "Incoming damage is reduced by a flat amount until your next turn (Liora also gains +1 mana from her ManaCharge passive).",
    },
  },
  blessing: {
    icon: '✨',
    tone: 'good',
    label: { th: 'Blessing', en: 'Blessing' },
    desc: {
      th: 'ทั้งวงโจมตีแรงขึ้นและรับดาเมจน้อยลง เป็นเวลา 4 ช่องนาฬิกา นับจากตอนร่าย ไม่ขึ้นกับเทิร์นของคนร่าย',
      en: 'The whole party hits harder and takes less damage for 4 clock slots from the moment it\'s cast — independent of the caster\'s own turn.',
    },
  },
  guarding: {
    icon: '🛡️',
    tone: 'neutral',
    label: { th: 'กำลังปกป้อง', en: 'Guarding' },
    desc: {
      th: 'รับดาเมจแทนเพื่อนที่ปกป้องอยู่ จนถึงเทิร์นหน้าของตัวเอง — ถ้าบอสออกท่าที่ตีทุกคน จะกินสองต่อ',
      en: "Taking the warded ally's damage until your next turn — against a move that hits everyone, you take both shares.",
    },
  },
  guarded: {
    icon: '🛡️',
    tone: 'good',
    label: { th: 'ถูกปกป้องอยู่', en: 'Guarded' },
    desc: {
      th: 'ดาเมจที่เล็งมาที่คุณจะไปเข้าคนที่ปกป้องคุณแทน จนถึงเทิร์นหน้าของเขา',
      en: 'Damage aimed at you lands on your guardian instead, until their next turn.',
    },
  },
  down: {
    icon: '💀',
    tone: 'bad',
    label: { th: 'ตาย', en: 'Down' },
    desc: {
      th: 'ออกจากนาฬิกาชั่วคราว แล้วฟื้นอัตโนมัติหลังมาร์กเกอร์เดินไป 6 ช่อง ด้วย HP ครึ่งหนึ่ง (ถ้าเหลือไม่ถึง 6 ช่อง = ไม่ฟื้นในยกนี้)',
      en: 'Off the clock for now, auto-reviving at half HP 6 slots later — or not at all this battle if fewer than 6 slots remain.',
    },
  },
  pending: {
    icon: '⏳',
    tone: 'neutral',
    label: { th: 'แอคชันที่ประกาศไว้', en: 'Declared Action' },
    desc: {
      th: 'ประกาศไว้แล้ว จะเกิดผลจริงตอนมาร์กเกอร์เดินมาถึงช่องปลายทาง',
      en: 'Already declared — it resolves when the marker reaches its landing slot.',
    },
  },
};

export interface ActiveStatus {
  id: StatusId;
  /** Short value shown next to the icon (stack count, buff numbers, revive slot, ...). */
  value?: string;
}

export function bossStatuses(battle: BattleState): ActiveStatus[] {
  const out: ActiveStatus[] = [];
  if (battle.weakPoint) out.push({ id: 'weakPoint', value: '+4' });
  if (battle.bossId === 'Ragorath') out.push({ id: 'rage', value: `${battle.rage}` });
  if (battle.armor > 0) out.push({ id: 'armor', value: `${battle.armor}` });
  if (battle.bossId === 'Somnivar') out.push({ id: 'sleepAura' });
  return out;
}

export function heroStatuses(battle: BattleState, f: Fighter): ActiveStatus[] {
  const out: ActiveStatus[] = [];
  if (!f.alive) {
    out.push({ id: 'down', value: f.reviveAtSlot != null ? `→${f.reviveAtSlot}` : '✕' });
    return out;
  }
  if (f.shield?.kind === 'counter') out.push({ id: 'counter', value: `-${f.shield.reduction}%` });
  if (f.shield?.kind === 'mana') out.push({ id: 'manaShield', value: `-${f.shield.reduction}` });
  if (battle.partyBuff) out.push({ id: 'blessing', value: `+${battle.partyBuff.atk}/-${battle.partyBuff.dmgReduction}` });
  // Both ends of a Guard link get a badge — the ward needs to know their damage is being absorbed
  // just as much as the guardian needs to know they're absorbing it.
  if (battle.guard?.guardianId === f.playerId) out.push({ id: 'guarding' });
  if (battle.guard?.wardId === f.playerId) out.push({ id: 'guarded' });
  return out;
}
