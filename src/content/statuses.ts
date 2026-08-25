import type { BattleState, Fighter } from '@engine/index';
import { AILMENTS } from './ailments';

/** v0.4.0 ailments are addressed as `ailment:<id>` rather than being enumerated here, so adding one
 *  to @content/ailments is enough — the badge row and the detail modal both pick it up. */
export type StatusId =
  | `ailment:${string}`
  | 'stealth'
  | 'weakPoint'
  | 'rage'
  | 'armor'
  | 'sleepAura'
  | 'envy'
  | 'hoard'
  | 'swallowing'
  | 'temptation'
  | 'pawnRank'
  | 'blackSlots'
  | 'phase2'
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
export const STATUS_DEF: Record<Exclude<StatusId, `ailment:${string}`>, StatusDef> = {
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
  // ── Seven Sins / Chess series ──
  envy: {
    icon: '😖',
    tone: 'bad',
    label: { th: 'แต้มริษยา', en: 'Envy' },
    desc: {
      th: 'ทุกครั้งที่ผู้เล่นได้รับบัฟจากคนอื่น Levithar ได้ +1 · ท่า A แรงขึ้นตามครึ่งหนึ่งของแต้ม และท่า C ระเบิดทั้งกองใส่ทุกคน (เพดาน 12) แล้วล้างเป็น 0 · ครบ 6 ช่องที่ไม่มีใครบัฟใคร มันเสีย 6 HP และแต้ม −3',
      en: 'Levithar gains 1 every time a player receives a buff from someone else. Its A move scales with half the meter; its C move spends the whole pile at once (capped at 12) and resets. Six clock slots with nobody buffing anybody costs it 6 HP and 3 envy.',
    },
  },
  hoard: {
    icon: '🪙',
    tone: 'bad',
    label: { th: 'กองสมบัติ', en: 'Hoard' },
    desc: {
      th: 'ทองแต่ละชิ้นลดดาเมจที่เข้า 1 และบอสได้ +1 ทุกครั้งที่ลงมือ · ต่างจากเกราะตรงที่ปล้นได้: หมัดเดียวที่แรงเกิน 10 ปล้นไป 2 ชิ้น และทองที่ปล้นได้กลายเป็น 💎 ของคนปล้นตอนจบยก',
      en: 'Each gold cancels 1 incoming damage, and the boss gains 1 every time it acts. Unlike armor it can be stolen: a single hit over 10 takes 2, and robbed gold becomes real gems for the robber when the battle ends.',
    },
  },
  swallowing: {
    icon: '🫃',
    tone: 'bad',
    label: { th: 'กลืนผู้เล่นอยู่', en: 'Holding Someone' },
    desc: {
      th: 'ผู้เล่นที่ถูกกลืนออกจากการเป็นเป้าหมาย ไม่ได้ผลของสกิลใดๆ ทำได้แค่ดิ้น (ดาเมจ = ⏱ ของการ์ดที่ประกาศ ไม่สนเกราะ) · วงต้องทำดาเมจรวม 15 นับจากที่ถูกกลืนเพื่อดึงเขาออกมา',
      en: 'The swallowed player cannot be targeted and gets no skill effects — only a flail worth the ⏱ of the card they declared, ignoring armor. The party must deal 15 damage since the swallow to cut them out.',
    },
  },
  temptation: {
    icon: '😈',
    tone: 'neutral',
    label: { th: 'ข้อเสนอ', en: 'Temptation' },
    desc: {
      th: 'ข้อเสนอหงายอยู่กลางโต๊ะ · ใครก็รับได้ในตาของตัวเอง คนแรกที่รับได้ไป · ทุกข้อเสนอคือ "ฉันได้ วงเสีย" · ถ้าไม่มีใครรับเลยจนถึงตาถัดไปของบอส มันเสีย 10 HP และเสียตานั้นทั้งตา',
      en: 'An offer lies face up. Anyone may take it on their own turn and the first taker gets it. Every offer means "I gain, the party loses" — and one nobody takes before the boss acts again costs it 10 HP and that whole turn.',
    },
  },
  pawnRank: {
    icon: '⬆️',
    tone: 'bad',
    label: { th: 'ขั้น', en: 'Rank' },
    desc: {
      th: 'ทุกขั้นเพิ่มดาเมจของทุกท่า +1 และเบี้ยสะสมขึ้นเรื่อยๆ · เบี้ยถอยไม่เป็น ทุกครั้งที่ถูกผลักถอย (กับดัก · Grapnel · ❄️ Slow) ขั้นลด 1',
      en: 'Every rank adds 1 damage to all of its moves and it keeps gaining them. A pawn cannot retreat: every push backwards — a trap, a grapnel, a Slow — strips one rank off.',
    },
  },
  blackSlots: {
    icon: '⬛',
    tone: 'neutral',
    label: { th: 'ช่องดำ = ช่องเลขคี่', en: 'Black = odd slots' },
    desc: {
      th: 'ยืนช่องดำ: บิชอปตีคุณได้เต็ม แต่คุณก็ตีเต็มและทะลุเกราะ · ยืนช่องขาว: มันแตะคุณไม่ได้ แต่ดาเมจของคุณเหลือครึ่งเดียว · ท่า B สลับนิยามสีทั้งกระดาน',
      en: 'On a black slot the Bishop hits you fully — and you hit fully, ignoring its armor. On a white slot it cannot touch you and your damage is halved. Its B move swaps which parity is which.',
    },
  },
  phase2: {
    icon: '👑',
    tone: 'bad',
    label: { th: 'เฟส 2', en: 'Phase 2' },
    desc: {
      th: 'บอสพลิกแผ่นแล้ว — ใช้ตารางท่าอีกด้าน · เกราะและบัฟสะสมทั้งหมดหายไป และทุกท่าเร็วขึ้น',
      en: 'The boss has flipped its sheet and reads from the other move table. Its accumulated armor and buffs are gone, and everything it does is faster.',
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
  stealth: {
    icon: '🌫️',
    tone: 'good',
    label: { th: 'ซ่อนตัว', en: 'Hidden' },
    desc: {
      th: 'บอสเลือกคุณเป็นเป้าไม่ได้ (ยกเว้นท่าที่ตีทุกคน) · ออกจากการซ่อนทันทีที่โจมตี และการโจมตีนั้นแรงขึ้น',
      en: 'The boss cannot single you out (AoE still lands). Attacking breaks it — and that attack hits harder.',
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

/** Resolves a StatusId to its definition, mapping the `ailment:<id>` family through to
 *  @content/ailments so ailments never need duplicate entries in STATUS_DEF. */
export function statusDef(id: StatusId): StatusDef {
  if (id.startsWith('ailment:')) {
    const a = AILMENTS[id.slice('ailment:'.length) as keyof typeof AILMENTS];
    return { icon: a.icon, tone: 'bad', label: a.name, desc: a.desc };
  }
  return STATUS_DEF[id as Exclude<StatusId, `ailment:${string}`>];
}

export function bossStatuses(battle: BattleState): ActiveStatus[] {
  const out: ActiveStatus[] = [];
  if (battle.weakPoint) out.push({ id: 'weakPoint', value: '+4' });
  if (battle.bossId === 'Ragorath') out.push({ id: 'rage', value: `${battle.rage}` });
  if (battle.armor > 0) out.push({ id: 'armor', value: `${battle.armor}` });
  if (battle.bossId === 'Somnivar') out.push({ id: 'sleepAura' });
  // ── Seven Sins / Chess. Each of these is that boss's whole fight, so it belongs on the badge row
  // rather than buried in the detail panel: §3.2's principle only works if the meter is visible.
  if (battle.phase === 2) out.push({ id: 'phase2' });
  if (battle.bossId === 'Levithar') out.push({ id: 'envy', value: `${battle.envy}` });
  if (battle.bossId === 'Mammorax') out.push({ id: 'hoard', value: `${battle.hoard}` });
  if (battle.swallowedId !== null) out.push({ id: 'swallowing', value: `P${battle.swallowedId}` });
  if (battle.offer && battle.offer.takenBy === null) out.push({ id: 'temptation', value: `#${battle.offer.die}` });
  if (battle.bossId === 'PawnRank') out.push({ id: 'pawnRank', value: `+${battle.pawnRank}` });
  if (battle.bossId === 'Bishop') out.push({ id: 'blackSlots', value: battle.colorFlipped ? 'คู่' : 'คี่' });
  return out;
}

export function heroStatuses(battle: BattleState, f: Fighter): ActiveStatus[] {
  const out: ActiveStatus[] = [];
  if (!f.alive) {
    out.push({ id: 'down', value: f.reviveAtSlot != null ? `→${f.reviveAtSlot}` : '✕' });
    return out;
  }
  // v0.4.0 ailments render ahead of the buffs so bad news reads first. Empty in the v0.3 ruleset,
  // where nothing ever applies one.
  for (const a of f.ailments) {
    out.push({ id: `ailment:${a.id}`, value: a.stacks > 1 ? `×${a.stacks}` : undefined });
  }
  if (f.stealthUntilSlot != null) out.push({ id: 'stealth' });
  if (f.shield?.kind === 'counter') out.push({ id: 'counter', value: `-${f.shield.reduction}%` });
  if (f.shield?.kind === 'mana') out.push({ id: 'manaShield', value: `-${f.shield.reduction}` });
  if (battle.partyBuff) out.push({ id: 'blessing', value: `+${battle.partyBuff.atk}/-${battle.partyBuff.dmgReduction}` });
  // Both ends of a Guard link get a badge — the ward needs to know their damage is being absorbed
  // just as much as the guardian needs to know they're absorbing it.
  if (battle.guard?.guardianId === f.playerId) out.push({ id: 'guarding' });
  if (battle.guard?.wardId === f.playerId) out.push({ id: 'guarded' });
  return out;
}
