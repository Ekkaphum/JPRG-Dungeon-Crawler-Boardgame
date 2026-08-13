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
      return th ? `โจมตีบอส ${p} · ถ้า HP ≤ 5 เป็น ${q}` : `${p} damage to the boss · ${q} while at HP ≤ 5`;
    case 'Guard':
      return th
        ? `รับดาเมจแทนเพื่อน 1 คน (ลดลง ${p}) · เขาโจมตี +${q}`
        : `Take one ally's damage (reduced by ${p}) · they attack +${q}`;
    case 'CounterAttack':
      return th ? `ลดดาเมจที่เข้า ${p}% · โดนตีสวนกลับทันที ${q} ทุกครั้ง` : `Take ${p}% less · riposte ${q} instantly on every hit`;
    case 'QuickShot':
      return th ? `โจมตี ${p} · ทอยเต๋าเปิดจุดอ่อน (${s.rollBaseTarget}+)` : `${p} damage · roll ${s.rollBaseTarget}+ to open a weak point`;
    case 'SetTrap':
      return th
        ? `วางกับดัก ${p} (ไม่สนเกราะ) ในช่วง ⏱ ของสกิล · โดนแล้วทอย ${s.rollBaseTarget}+ ยกเลิกท่าบอส`
        : `Trap for ${p} (ignores armor) inside the skill's own window · on a hit, roll ${s.rollBaseTarget}+ to cancel the boss's move`;
    case 'TwinShot':
      return th ? `โจมตี ${p} × ${q} ครั้ง (รวม ${p * q})` : `${p} damage ×${q} (${p * q} total)`;
    case 'Fireball':
    case 'Meteor':
      return th ? `โจมตี ${p} + ${q} ต่อมานาที่จ่าย` : `${p} damage +${q} per mana spent`;
    case 'ManaCharge':
      return th ? `มานา +${p} · ลดดาเมจที่เข้า ${q}` : `+${p} mana · take ${q} less damage`;
    case 'Heal':
      return th ? `ฟื้น HP ให้เป้าหมาย ${p}` : `Restore ${p} HP`;
    case 'Blessing':
      return th ? `ทั้งวง +${p} ATK · ลดดาเมจ ${q}` : `Party +${p} ATK · ${q} less damage taken`;
    case 'Smite':
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
      return th
        ? `โจมตีบอส ${p} ดาเมจ — ถ้าตอนรับผล HP ของคุณ ≤ 5 จะเป็น ${q} ดาเมจแทน (เช็คตอนรับผล ไม่ใช่ตอนประกาศ: ถ้ามีคนฮีลคุณขึ้นเกิน 5 ก่อน หมัดนี้จะกลับไปเป็น ${p})`
        : `Deal ${p} damage to the boss — or ${q} if your HP is ${'≤'} 5 when it resolves (checked on resolve, not on declare: an ally healing you back above 5 first drops it to ${p}).`;
    case 'Guard':
      return th
        ? `ทันทีที่ประกาศ: เลือกเพื่อน 1 คน (ไม่ใช่ตัวเอง) จนถึงเทิร์นหน้าของคุณ — ดาเมจทั้งหมดที่เขาจะได้รับ มาเข้าคุณแทนโดยลดลง ${p} และเขาโจมตีแรงขึ้น +${q} · ท่าที่ตีทุกคน (AoE) คุณจะกินทั้งของตัวเองและของเขา`
        : `On declare: pick one ally (never yourself) until your next turn — all damage aimed at them lands on you instead, reduced by ${p}, and they attack for +${q}. Against a move that hits everyone you take both your share and theirs.`;
    case 'CounterAttack':
      return th
        ? `ทันทีที่ประกาศ: ดาเมจที่เข้าลด ${p}% · ทุกครั้งที่โดนตีระหว่างนั้น สวนกลับบอส ${q} ทันที (โดนกี่ครั้งก็สวนกี่ครั้ง แม้ดาเมจที่เข้าจะเหลือ 0) · พอถึงตาตัวเองรอบหน้าแค่หมดฤทธิ์ ไม่ตีซ้ำ`
        : `On declare: incoming damage reduced ${p}% · every hit during the window is answered with an immediate ${q} riposte (once per hit, even if the damage rounds to 0) · reaching your next turn just ends it, with no extra strike.`;
    case 'QuickShot':
      return th
        ? `โจมตี ${p} ดาเมจ + ทอย d6 เปิดจุดอ่อน (ต้อง ${s.rollBaseTarget}+ · พลาดแล้วง่ายขึ้น 1 ทุกครั้ง · ครั้งที่ 5 สำเร็จอัตโนมัติ) — เปิดแล้วทุกคนโจมตี +4 จนบอสลงมือ`
        : `Deal ${p} damage and roll d6 to open a weak point (need ${s.rollBaseTarget}+, 1 easier per miss, auto on the 5th try) — everyone then deals +4 until the boss acts.`;
    case 'SetTrap':
        return th
        ? `เลือกวางกับดัก 1 ช่องภายในช่วง ⏱ ของสกิลนี้ · ถ้าบอสมา "หยุด" ตรงนั้นพอดี: ${p} ดาเมจ (ไม่สนเกราะ) แล้วทอย d6 (ต้อง ${s.rollBaseTarget}+ · พลาดแล้วง่ายขึ้น 1 ทุกครั้ง · ครั้งที่ 5 สำเร็จอัตโนมัติ) ถ้าผ่านคือยกเลิกท่าที่บอสประกาศไว้ · ถ้ามาร์กเกอร์เดินผ่านเฉยๆ กับดักหายไป`
        : `Arm the trap on one slot inside this skill's own window · if the boss *stops* exactly there: ${p} damage (ignores armor), then roll d6 (need ${s.rollBaseTarget}+, 1 easier per miss, auto on the 5th) to cancel its declared move · if the marker merely passes, the trap is lost.`;
    case 'TwinShot':
      return th ? `โจมตีบอส ${p} ดาเมจ ${q} ครั้ง (รวม ${p * q})` : `Hit the boss for ${p}, ${q} times (${p * q} total).`;
    case 'Fireball':
    case 'Meteor':
      return th
        ? `โจมตี ${p} ดาเมจ + ${q} ต่อมานา 1 หน่วยที่จ่าย (จ่ายได้สูงสุด 3 → ${p + q * 3}) · มานาจ่ายตอนประกาศ ไม่คืนแม้แอคชันจะเสียฟรี`
        : `Deal ${p} damage +${q} per mana spent (up to 3 → ${p + q * 3}) · mana is paid on declare and never refunded.`;
    case 'ManaCharge':
      return th
        ? `ทันทีที่ประกาศ: ได้มานา +${p} (เก็บได้สูงสุด 3) และดาเมจที่เข้าลด ${q} จนถึงเทิร์นหน้าของตัวเอง`
        : `On declare: gain ${p} mana (cap 3) and reduce incoming damage by ${q} until your next turn.`;
    case 'Heal':
      return th
        ? `ฟื้น HP ให้เป้าหมาย ${p} แต้ม — ถ้าเป้าหมายตายไปก่อนถึงตาคุณ แอคชันนี้เสียฟรี`
        : `Restore ${p} HP to the target — wasted if the target dies before it resolves.`;
    case 'Blessing':
      return th
        ? `ทันทีที่ประกาศ: ทั้งวงโจมตี +${p} และดาเมจที่เข้าลด ${q} จนถึงเทิร์นหน้าของคุณ (บัฟ "ทุกคน" ไม่รวมบอส)`
        : `On declare: the whole party gains +${p} attack and -${q} incoming damage until your next turn (party-only, never the boss).`;
    case 'Smite':
      return th ? `โจมตีบอส ${p} ดาเมจ — ไม่สนเกราะ` : `Deal ${p} damage to the boss, ignoring armor.`;
    default:
      return '';
  }
}
