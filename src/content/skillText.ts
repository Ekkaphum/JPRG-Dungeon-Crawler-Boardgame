import { skillStats, type SkillId } from './characters';
import type { Lang } from './i18n';

/** One-line version for the centre-screen flash — same numbers, trimmed to what fits over the
 *  board. The full wording lives in skillEffectText below. */
export function skillBriefText(skillId: SkillId, isLv2: boolean, lang: Lang): string {
  const s = skillStats(skillId, isLv2);
  const p = s.primary ?? 0;
  const q = s.secondary ?? 0;
  const th = lang === 'th';

  switch (skillId) {
    case 'Slash':
    case 'QuickShot':
    case 'AirPush':
    case 'Hitting':
      return th ? `โจมตีบอส ${p} (สกิลพื้นฐาน)` : `${p} damage to the boss (common attack)`;
    case 'PowerStrike':
      return th ? `โจมตีบอส ${p}` : `${p} damage to the boss`;
    case 'Guard':
      return th ? `รับดาเมจแทนเพื่อน 1 คน (ลดลง ${p})` : `Take one ally's damage instead (reduced by ${p})`;
    case 'CounterAttack':
      return th ? `ลดดาเมจที่เข้า ${p}% · โดนตีสวนกลับทันที ${q} ทุกครั้ง` : `Take ${p}% less · riposte ${q} instantly on every hit`;
    case 'SharpShooting':
      return th
        ? `โจมตี ${p} · ทอยเต๋าเปิดจุดอ่อน (${s.rollBaseTarget}+) — ทุกคนโจมตี +4`
        : `${p} damage · roll ${s.rollBaseTarget}+ to open a weak point — everyone deals +4`;
    case 'Trap':
      return th
        ? `วางกับดัก ${p} (ไม่สนเกราะ) ในระยะ 3 ช่องถัดไป · โดนแล้วทอย ${s.rollBaseTarget}+ ถ่วงท่าบอสออกไป 2 ช่อง`
        : `Trap for ${p} (ignores armor) up to 3 slots ahead · on a hit, roll ${s.rollBaseTarget}+ to push the boss's move back 2 slots`;
    case 'MultiShot': {
      const early = s.earlyHits ?? [];
      const all = [...early.map((h) => h.dmg), p];
      return th ? `โจมตี ${all.join('/')} ที่ระยะ ${early.map((h) => h.offset).join('/')}/${s.time} ช่อง` : `Hits ${all.join('/')} at ${early.map((h) => h.offset).join('/')}/${s.time} slots out`;
    }
    case 'Fireball':
    case 'Meteor':
      return th ? `โจมตี ${p} + ${q} ต่อมานาที่จ่าย` : `${p} damage +${q} per mana spent`;
    case 'AuraCharge':
      return th ? `Def +${q} (มานา +1 จากพาสซีฟ ManaCharge)` : `Def +${q} (+1 mana from the ManaCharge passive)`;
    case 'Heal':
      return th ? `ฟื้น HP ให้เป้าหมาย ${p}` : `Restore ${p} HP`;
    case 'Blessing':
      return th ? `ทั้งวง +${p} ATK · เกราะ +${q} เป็นเวลา 4 ช่อง` : `Party +${p} ATK · +${q} armor for 4 slots`;
    case 'AuraSmite':
      return th ? `โจมตี ${p} — ไม่สนเกราะ` : `${p} damage, ignores armor`;
    default:
      return '';
  }
}

/** Full rules text for a skill at the level the player currently has it, built from the same
 *  numbers the engine uses — so the detail panel can never quote a stale value. */
export function skillEffectText(skillId: SkillId, isLv2: boolean, lang: Lang): string {
  const s = skillStats(skillId, isLv2);
  const p = s.primary ?? 0;
  const q = s.secondary ?? 0;
  const th = lang === 'th';

  switch (skillId) {
    case 'Slash':
    case 'QuickShot':
    case 'AirPush':
    case 'Hitting':
      return th ? `สกิลพื้นฐาน ไม่มีเงื่อนไข — โจมตีบอส ${p} ดาเมจ, ⏱${s.time}` : `Common attack, no conditions — deal ${p} damage to the boss, ⏱${s.time}.`;
    case 'PowerStrike':
      return th
        ? `โจมตีบอส ${p} ดาเมจ — ขณะ HP ต่ำกว่า 7 พาสซีฟ Berserk เพิ่มดาเมจนี้ (และทุกดาเมจของ Matt) อีก +4`
        : `Deal ${p} damage to the boss — while HP is below 7, the Berserk passive adds +4 to this (and every) Matt attack.`;
    case 'Guard':
      return th
        ? `ทันทีที่ประกาศ: เลือกเพื่อน 1 คน (ไม่ใช่ตัวเอง) จนถึงเทิร์นหน้าของคุณ — ดาเมจทั้งหมดที่เขาจะได้รับ มาเข้าคุณแทนโดยลดลง ${p} · ท่าที่ตีทุกคน (AoE) คุณจะกินทั้งของตัวเองและของเขา`
        : `On declare: pick one ally (never yourself) until your next turn — all damage aimed at them lands on you instead, reduced by ${p}. Against a move that hits everyone you take both your share and theirs.`;
    case 'CounterAttack':
      return th
        ? `ทันทีที่ประกาศ: ดาเมจที่เข้าลด ${p}% · ทุกครั้งที่โดนตีระหว่างนั้น สวนกลับบอส ${q} ทันที (โดนกี่ครั้งก็สวนกี่ครั้ง แม้ดาเมจที่เข้าจะเหลือ 0) · พอถึงตาตัวเองรอบหน้าแค่หมดฤทธิ์ ไม่ตีซ้ำ`
        : `On declare: incoming damage reduced ${p}% · every hit during the window is answered with an immediate ${q} riposte (once per hit, even if the damage rounds to 0) · reaching your next turn just ends it, with no extra strike.`;
    case 'SharpShooting':
      return th
        ? `โจมตี ${p} ดาเมจ + ทอย d6 เปิดจุดอ่อน (ต้อง ${s.rollBaseTarget}+ — เกณฑ์นี้ลดลงถาวรทุกครั้งที่พลาด จากพาสซีฟ Skill Improvement, ต่ำสุด 2) — เปิดแล้วทุกคนโจมตี +4 จนบอสลงมือ`
        : `Deal ${p} damage and roll d6 to open a weak point (need ${s.rollBaseTarget}+ — permanently lowered by 1 on every miss via the Skill Improvement passive, floor of 2) — everyone then deals +4 until the boss acts.`;
    case 'Trap':
        return th
        ? `เลือกวางกับดัก 1 ช่อง ไม่เกิน 3 ช่องถัดจากตำแหน่งปัจจุบัน · ถ้าบอสมา "หยุด" ตรงนั้นพอดี: ${p} ดาเมจ (ไม่สนเกราะ) แล้วทอย d6 (ต้อง ${s.rollBaseTarget}+, ลดลงถาวรทุกครั้งที่พลาดจากพาสซีฟ Skill Improvement, ต่ำสุด 2) ถ้าผ่านคือถ่วงท่าที่บอสประกาศไว้ออกไปอีก 2 ช่อง (ท่ายังลงอยู่ แต่บอสต้องรออีก 2 ช่องถึงจะลงมือ) · ถ้ามาร์กเกอร์เดินผ่านเฉยๆ กับดักหายไป`
        : `Arm the trap on one slot up to 3 ahead of your current position · if the boss *stops* exactly there: ${p} damage (ignores armor), then roll d6 (need ${s.rollBaseTarget}+, permanently lowered by 1 on every miss via Skill Improvement, floor of 2) to push its declared move back 2 slots — the move still lands, but the boss stalls for those slots first · if the marker merely passes, the trap is lost.`;
    case 'MultiShot': {
      const early = s.earlyHits ?? [];
      const parts = [...early.map((h) => `${h.dmg} dmg ที่ระยะ ${h.offset} ช่อง`), `${p} dmg ที่ระยะ ${s.time} ช่อง (ตอน resolve)`];
      const partsEn = [...early.map((h) => `${h.dmg} dmg ${h.offset} slots out`), `${p} dmg ${s.time} slots out (on resolve)`];
      return th
        ? `ยิง 3 นัดจากแอคชันเดียว: ${parts.join(', ')} — แต่ละนัดนับเป็น 1 hit และรับบัฟแยกกัน · ถ้า Kit ตาย ยกเลิกทุกนัดที่ยังไม่ยิงทันที`
        : `Three hits from one declare: ${partsEn.join(', ')} — each counts as a separate hit and receives buffs separately; if Kit dies, cancel every unfired hit immediately.`;
    }
    case 'Fireball':
    case 'Meteor':
      return th
        ? `โจมตี ${p} ดาเมจ + ${q} ต่อมานา 1 หน่วยที่จ่าย (จ่ายได้สูงสุด 3 → ${p + q * 3}) · มานาจ่ายตอนประกาศ ไม่คืนแม้แอคชันจะเสียฟรี — มานาได้มาจากพาสซีฟ ManaCharge ตอนใช้ Aura Charge`
        : `Deal ${p} damage +${q} per mana spent (up to 3 → ${p + q * 3}) · mana is paid on declare and never refunded — mana itself comes from the ManaCharge passive whenever Aura Charge is used.`;
    case 'AuraCharge':
      return th
        ? `ทันทีที่ประกาศ: ดาเมจที่เข้าลด ${q} จนถึงเทิร์นหน้าของตัวเอง · พาสซีฟ ManaCharge มอบมานา +1 (เก็บได้สูงสุด 3) ให้ทันทีที่ใช้การ์ดนี้`
        : `On declare: incoming damage reduced by ${q} until your next turn · the ManaCharge passive grants +1 mana (cap 3) the instant this card is used.`;
    case 'Heal':
      return th
        ? `ฟื้น HP ให้เป้าหมาย ${p} แต้ม — ถ้าเป้าหมายตายไปก่อนถึงตาคุณ แอคชันนี้เสียฟรี`
        : `Restore ${p} HP to the target — wasted if the target dies before it resolves.`;
    case 'Blessing':
      return th
        ? `ทันทีที่ประกาศ: ทั้งวงโจมตี +${p} และได้เกราะ +${q} เป็นเวลา 4 ช่องนาฬิกาเท่านั้น ไม่ผูกกับเทิร์นหน้าของ Luna (บัฟ "ทุกคน" ไม่รวมบอส)`
        : `On declare: the whole party gains +${p} attack and +${q} armor for exactly 4 clock slots, independent of Luna's next turn (party-only, never the boss).`;
    case 'AuraSmite':
      return th ? `โจมตีบอส ${p} ดาเมจ — ไม่สนเกราะ` : `Deal ${p} damage to the boss, ignoring armor.`;
    default:
      return '';
  }
}
