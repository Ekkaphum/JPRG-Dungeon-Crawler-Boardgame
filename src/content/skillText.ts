import { V045_LIORA_MANA_MAX, skillDefFor, skillStats, type SkillId } from './characters';
import { STABLE_RULESET, type RulesetVersion } from './rulesets';
import type { Lang } from './i18n';

/** One-line version for the centre-screen flash — same numbers, trimmed to what fits over the
 *  board. The full wording lives in skillEffectText below. */
export function skillBriefText(skillId: SkillId, isLv2: boolean, lang: Lang, ruleset: RulesetVersion = STABLE_RULESET): string {
  const s = skillStats(skillId, isLv2, ruleset);
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
      // The rework's 1 HP self-cost belongs in the one-liner: it is the only card in the game that
      // can be illegal to declare, so a player reading only the flash needs to see the price.
      return skillDefFor(skillId, ruleset).selfHpCost
        ? th ? `โจมตีบอส ${p} · เสีย HP ตัวเอง ${skillDefFor(skillId, ruleset).selfHpCost}` : `${p} damage to the boss · costs you ${skillDefFor(skillId, ruleset).selfHpCost} HP`
        : th ? `โจมตีบอส ${p}` : `${p} damage to the boss`;
    case 'Guard':
      return th ? `รับดาเมจแทนเพื่อน 1 คน (ลดลง ${p})` : `Take one ally's damage instead (reduced by ${p})`;
    case 'CounterAttack':
      return th ? `ลดดาเมจที่เข้า ${p}% · โดนตีสวนกลับทันที ${q} ทุกครั้ง` : `Take ${p}% less · riposte ${q} instantly on every hit`;
    case 'SharpShooting': {
      const focus = skillDefFor(skillId, ruleset).focusSpendable ? (th ? ' · จ่าย Focus บวกแต้มเต๋าได้' : ' · spend Focus to raise the die') : '';
      return th
        ? `โจมตี ${p} · ทอยเต๋าเปิดจุดอ่อน (${s.rollBaseTarget}+) — ทุกคนโจมตี +4${focus}`
        : `${p} damage · roll ${s.rollBaseTarget}+ to open a weak point — everyone deals +4${focus}`;
    }
    case 'Trap': {
      const focus = skillDefFor(skillId, ruleset).focusSpendable ? (th ? ' · จ่าย Focus บวกแต้มเต๋าได้' : ' · spend Focus to raise the die') : '';
      return th
        ? `วางกับดัก ${p} (ไม่สนเกราะ) ในระยะ 3 ช่องถัดไป · โดนแล้วทอย ${s.rollBaseTarget}+ ถ่วงท่าบอสออกไป 2 ช่อง${focus}`
        : `Trap for ${p} (ignores armor) up to 3 slots ahead · on a hit, roll ${s.rollBaseTarget}+ to push the boss's move back 2 slots${focus}`;
    }
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
    case 'Heal': {
      const cost = skillDefFor(skillId, ruleset).manaCost;
      return cost
        ? th ? `จ่ายมานา ${cost} · ฟื้น HP ให้เป้าหมาย ${p}` : `Spend ${cost} mana · restore ${p} HP`
        : th ? `ฟื้น HP ให้เป้าหมาย ${p}` : `Restore ${p} HP`;
    }
    case 'Blessing':
      return th ? `ทั้งวง +${p} ATK · เกราะ +${q} เป็นเวลา 4 ช่อง` : `Party +${p} ATK · +${q} armor for 4 slots`;
    case 'AuraSmite':
      return th ? `โจมตี ${p} — ไม่สนเกราะ` : `${p} damage, ignores armor`;
    // ── v0.4.0 ──
    case 'Tick':
    case 'Shuriken':
      return th ? `โจมตีบอส ${p} (สกิลพื้นฐาน)` : `${p} damage to the boss (common attack)`;
    case 'Drain':
      return th ? `โจมตี ${p} · ดูดเลือดตัวเอง 1` : `${p} damage · drain 1 HP for yourself`;
    case 'HourglassShard':
      return th ? `โจมตี ${p} · บอสติดมึนงง (+1 ⏱)` : `${p} damage · dazes the boss (+1 ⏱)`;
    case 'Haste':
      return th ? `เลื่อนหมากเพื่อนขึ้น ${p} ช่อง` : `Pull an ally ${p} slots up the clock`;
    case 'Rewind':
      return th ? `ย้อนมาร์กเกอร์ขึ้น ${p} ช่อง` : `Rewind the marker ${p} slots`;
    case 'TwinFang':
      return th ? `โจมตี ${p} สองครั้ง` : `${p} damage, twice`;
    case 'SmokeBomb':
      return th ? `ซ่อนตัว ${q} ช่อง · ออกมาตีครั้งแรก +${p}` : `Hide for ${q} slots · +${p} on the strike that breaks it`;
    case 'Assassinate':
      return th ? `โจมตี ${p} ทะลุเกราะ · บอสเลือดน้อยยิ่งแรง` : `${p} damage, ignores armor · harder on a wounded boss`;
    case 'SoulSiphon':
      return th ? `โจมตี ${p} · ดูดเลือด 2 · วิญญาณ +1` : `${p} damage · drain 2 HP · +1 soul`;
    case 'RaiseDead':
      return th ? `ชุบเพื่อนที่ล้มกลับมาทันที (HP ${p}%)` : `Revive a downed ally now at ${p}% HP`;
    case 'DeathCoil':
      return th ? `โจมตี ${p} · จ่าย HP เพิ่มเป็น ${q}` : `${p} damage · pay HP to make it ${q}`;
    // ── v0.4.5 ──
    case 'SightingShot':
      return th ? `โจมตีบอส ${p} · ได้ Focus +1` : `${p} damage · gain 1 Focus`;
    case 'ManaDrain':
      return th ? `โจมตีบอส ${p} · ได้มานา +1` : `${p} damage · gain 1 mana`;
    case 'Freeze':
      return th ? `โจมตี ${p} + ${q} ต่อมานา · ทอย 4+ ติด ❄️ ช้า` : `${p} damage +${q} per mana · roll 4+ for ❄️ Slow`;
    case 'AuraShield':
      return th ? `เกราะ +${q} ให้ใครก็ได้ · จ่ายมานาเพิ่มได้` : `+${q} armor on any ally · pour in mana for more`;
    case 'HolySmite':
      return th ? `โจมตีบอส ${p} — ไม่สนเกราะเลย` : `${p} damage, ignores armor entirely`;
    case 'Praying':
      return th ? `ได้มานา +3` : `Gain 3 mana`;
    default:
      return '';
  }
}

/** Full rules text for a skill at the level the player currently has it, built from the same
 *  numbers the engine uses — so the detail panel can never quote a stale value. */
export function skillEffectText(skillId: SkillId, isLv2: boolean, lang: Lang, ruleset: RulesetVersion = STABLE_RULESET): string {
  const s = skillStats(skillId, isLv2, ruleset);
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
      // v0.4.5 changes both halves of this sentence — the swing costs 1 HP, and Berserk's bar moved
      // from a flat 7 to half of max HP — so the two rulesets get two texts rather than one hedged
      // one that is subtly wrong in both.
      if (ruleset === 'v0.4') {
        return th
          ? `โจมตีบอส ${p} ดาเมจ แต่เสีย HP ตัวเอง 1 ทุกครั้ง (ทะลุทุกการลดดาเมจ — เป็นราคาที่จ่ายเอง ไม่ใช่การโดนตี) · ขณะ HP ต่ำกว่าครึ่งของสูงสุด พาสซีฟ Berserk เพิ่มดาเมจของ Eric ทุกครั้งอีก +4 — HP ที่จ่ายไปจึงเป็นตัวพาเข้าเขต Berserk เอง · ประกาศไม่ได้ถ้าราคานี้จะทำให้ตัวเองตาย`
          : `Deal ${p} damage to the boss and pay 1 of your own HP every swing (ignores all mitigation — it is a price, not a hit). While HP is below half your maximum, the Berserk passive adds +4 to every Eric attack, so the HP you spend is what carries you into Berserk range. Refused if the cost would kill you.`;
      }
      return th
        ? `โจมตีบอส ${p} ดาเมจ — ขณะ HP ต่ำกว่า 7 พาสซีฟ Berserk เพิ่มดาเมจนี้ (และทุกดาเมจของ Eric) อีก +4`
        : `Deal ${p} damage to the boss — while HP is below 7, the Berserk passive adds +4 to this (and every) Eric attack.`;
    case 'Guard':
      return th
        ? `ทันทีที่ประกาศ: เลือกเพื่อน 1 คน (ไม่ใช่ตัวเอง) จนถึงเทิร์นหน้าของคุณ — ดาเมจทั้งหมดที่เขาจะได้รับ มาเข้าคุณแทนโดยลดลง ${p} · ท่าที่ตีทุกคน (AoE) คุณจะกินทั้งของตัวเองและของเขา`
        : `On declare: pick one ally (never yourself) until your next turn — all damage aimed at them lands on you instead, reduced by ${p}. Against a move that hits everyone you take both your share and theirs.`;
    case 'CounterAttack':
      return th
        ? `ทันทีที่ประกาศ: ดาเมจที่เข้าลด ${p}% · ทุกครั้งที่โดนตีระหว่างนั้น สวนกลับบอส ${q} ทันที (โดนกี่ครั้งก็สวนกี่ครั้ง แม้ดาเมจที่เข้าจะเหลือ 0) · พอถึงตาตัวเองรอบหน้าแค่หมดฤทธิ์ ไม่ตีซ้ำ`
        : `On declare: incoming damage reduced ${p}% · every hit during the window is answered with an immediate ${q} riposte (once per hit, even if the damage rounds to 0) · reaching your next turn just ends it, with no extra strike.`;
    case 'SharpShooting': {
      // v0.4.5 lets Kit add Focus to the die. Stated as a separate sentence rather than folded into
      // the roll clause because Focus raises the *roll*, not the target — a distinction that decides
      // whether Skill Improvement's falling target and Focus stack (they do).
      const focus = skillDefFor(skillId, ruleset).focusSpendable
        ? th
          ? ` · จ่าย Focus ได้ไม่จำกัดจำนวนที่ถืออยู่ — Focus 1 หน่วยบวกแต้มที่ทอยได้ +1 (บวกที่ลูกเต๋า ไม่ใช่ลดเกณฑ์ จึงซ้อนกับ Skill Improvement ได้)`
          : ` · Spend any amount of Focus you hold: each one adds +1 to the number you rolled (it lifts the die, not the target, so it stacks with Skill Improvement).`
        : '';
      return th
        ? `โจมตี ${p} ดาเมจ + ทอย d6 เปิดจุดอ่อน (ต้อง ${s.rollBaseTarget}+ — เกณฑ์นี้ลดลงถาวรทุกครั้งที่พลาด จากพาสซีฟ Skill Improvement, ต่ำสุด 2) — เปิดแล้วทุกคนโจมตี +4 จนบอสลงมือ${focus}`
        : `Deal ${p} damage and roll d6 to open a weak point (need ${s.rollBaseTarget}+ — permanently lowered by 1 on every miss via the Skill Improvement passive, floor of 2) — everyone then deals +4 until the boss acts.${focus}`;
    }
    case 'Trap':
        return th
        ? `เลือกวางกับดัก 1 ช่อง ไม่เกิน 3 ช่องถัดจากตำแหน่งปัจจุบัน · ถ้าบอสมา "หยุด" ตรงนั้นพอดี: ${p} ดาเมจ (ไม่สนเกราะ) แล้วทอย d6 (ต้อง ${s.rollBaseTarget}+, ลดลงถาวรทุกครั้งที่พลาดจากพาสซีฟ Skill Improvement, ต่ำสุด 2) ถ้าผ่านคือถ่วงท่าที่บอสประกาศไว้ออกไปอีก 2 ช่อง (ท่ายังลงอยู่ แต่บอสต้องรออีก 2 ช่องถึงจะลงมือ) · ถ้ามาร์กเกอร์เดินผ่านเฉยๆ กับดักหายไป${skillDefFor(skillId, ruleset).focusSpendable ? ' · Focus จ่ายตอนวางกับดัก และจะไปบวกแต้มเต๋า +1 ต่อหน่วยตอนที่กับดักทำงานจริง' : ''}`
        : `Arm the trap on one slot up to 3 ahead of your current position · if the boss *stops* exactly there: ${p} damage (ignores armor), then roll d6 (need ${s.rollBaseTarget}+, permanently lowered by 1 on every miss via Skill Improvement, floor of 2) to push its declared move back 2 slots — the move still lands, but the boss stalls for those slots first · if the marker merely passes, the trap is lost.${skillDefFor(skillId, ruleset).focusSpendable ? " · Focus is committed when you arm the trap, and each one adds +1 to that d6 whenever it eventually springs." : ''}`;
    case 'MultiShot': {
      const early = s.earlyHits ?? [];
      const parts = [...early.map((h) => `${h.dmg} dmg ที่ระยะ ${h.offset} ช่อง`), `${p} dmg ที่ระยะ ${s.time} ช่อง (ตอน resolve)`];
      const partsEn = [...early.map((h) => `${h.dmg} dmg ${h.offset} slots out`), `${p} dmg ${s.time} slots out (on resolve)`];
      return th
        ? `ยิง 3 นัดจากแอคชันเดียว: ${parts.join(', ')} — แต่ละนัดนับเป็น 1 hit และรับบัฟแยกกัน · ถ้า Kit ตาย ยกเลิกทุกนัดที่ยังไม่ยิงทันที`
        : `Three hits from one declare: ${partsEn.join(', ')} — each counts as a separate hit and receives buffs separately; if Kit dies, cancel every unfired hit immediately.`;
    }
    case 'Fireball':
    case 'Meteor': {
      // The mana *source* is the half of this that the rework changed: v0.3 banks it on Aura Charge,
      // v0.4.5 on Mana Drain (Aura Shield grants none). Quoting the wrong one would send a Liora
      // player to a card that does nothing for them.
      const src = ruleset === 'v0.4'
        ? th ? 'มานาได้มาจาก Mana Drain (Aura Shield ไม่ให้มานาแล้ว)' : 'mana comes from Mana Drain — Aura Shield no longer grants any'
        : th ? 'มานาได้มาจากพาสซีฟ ManaCharge ตอนใช้ Aura Charge' : 'mana itself comes from the ManaCharge passive whenever Aura Charge is used';
      return th
        ? `โจมตี ${p} ดาเมจ + ${q} ต่อมานา 1 หน่วยที่จ่าย (จ่ายได้สูงสุด ${V045_LIORA_MANA_MAX} → ${p + q * V045_LIORA_MANA_MAX}) · มานาจ่ายตอนประกาศ ไม่คืนแม้แอคชันจะเสียฟรี — ${src}`
        : `Deal ${p} damage +${q} per mana spent (up to ${V045_LIORA_MANA_MAX} → ${p + q * V045_LIORA_MANA_MAX}) · mana is paid on declare and never refunded — ${src}.`;
    }
    case 'AuraCharge':
      return th
        ? `ทันทีที่ประกาศ: ดาเมจที่เข้าลด ${q} จนถึงเทิร์นหน้าของตัวเอง · พาสซีฟ ManaCharge มอบมานา +1 (เก็บได้สูงสุด 3) ให้ทันทีที่ใช้การ์ดนี้`
        : `On declare: incoming damage reduced by ${q} until your next turn · the ManaCharge passive grants +1 mana (cap 3) the instant this card is used.`;
    case 'Heal':
      if (ruleset === 'v0.4') {
        return th
          ? `จ่ายมานา 2 — ฟื้น HP ให้เป้าหมาย ${p} แต้ม · มานาจ่ายตอนประกาศ ไม่คืนแม้เป้าหมายจะตายก่อนแอคชันลง`
          : `Spend 2 mana to restore ${p} HP to the target. The mana is paid on declare and is not refunded if the target dies before it resolves.`;
      }
      return th
        ? `ฟื้น HP ให้เป้าหมาย ${p} แต้ม — ถ้าเป้าหมายตายไปก่อนถึงตาคุณ แอคชันนี้เสียฟรี`
        : `Restore ${p} HP to the target — wasted if the target dies before it resolves.`;
    case 'Blessing':
      return th
        ? `ทันทีที่ประกาศ: ทั้งวงโจมตี +${p} และได้เกราะ +${q} เป็นเวลา 4 ช่องนาฬิกาเท่านั้น ไม่ผูกกับเทิร์นหน้าของ Luna (บัฟ "ทุกคน" ไม่รวมบอส)`
        : `On declare: the whole party gains +${p} attack and +${q} armor for exactly 4 clock slots, independent of Luna's next turn (party-only, never the boss).`;
    case 'AuraSmite':
      return th ? `โจมตีบอส ${p} ดาเมจ — ไม่สนเกราะ` : `Deal ${p} damage to the boss, ignoring armor.`;
    // ── v0.4.0 ──
    case 'Tick':
      return th
        ? `โจมตีบอส ${p} ดาเมจ · ⏱2 เร็วเกินกว่าจะสะสมเม็ดทราย (ต้อง ⏱3 ขึ้นไป)`
        : `Deal ${p} damage. At ⏱2 this is too fast to bank sand — that needs ⏱3 or slower.`;
    case 'HourglassShard':
      return th
        ? `โจมตีบอส ${p} ดาเมจ และทำให้บอสติด 💫 มึนงง (ท่าถัดไปของบอสใช้เวลา +1 ⏱) · ⏱3 จึงได้เม็ดทราย +1 ทุกครั้งที่ประกาศ`
        : `Deal ${p} damage and daze the boss (+1 ⏱ on its next move). At ⏱3 it also banks 1 sand every time you declare it.`;
    case 'Haste':
      return th
        ? `เลื่อนหมากของเพื่อน 1 คนขึ้นไปหามาร์กเกอร์ ${p} ช่อง — เขาจะได้เล่นเร็วขึ้น · ไม่มีวันเลื่อนขึ้นไปถึงหรือเลยมาร์กเกอร์`
        : `Drag one ally's pawn ${p} slots back up toward the marker so they act sooner. It can never reach or pass the marker.`;
    case 'Rewind':
      return th
        ? `จ่ายเม็ดทราย 3 — มาร์กเกอร์เดินย้อนขึ้น ${p} ช่อง ทั้งโต๊ะได้เวลาคืน · ไม่มีอะไรถูกทริกเกอร์ซ้ำ เพราะหมากทุกตัวอยู่ต่ำกว่ามาร์กเกอร์เสมอ`
        : `Spend 3 sand: the clock marker walks back up ${p} slots, giving the whole table time back. Nothing re-triggers — every pawn always sits below the marker.`;
    case 'Shuriken':
      return th ? `โจมตีบอส ${p} ดาเมจ` : `Deal ${p} damage to the boss.`;
    case 'TwinFang':
      return th
        ? `โจมตีบอส ${p} ดาเมจ สองครั้งแยกกัน — แต่ละครั้งกินบัฟและจุดอ่อนของตัวเอง`
        : `Two separate ${p}-damage hits — each one takes buffs and the weak point on its own.`;
    case 'SmokeBomb':
      return th
        ? `ตัวเองและทุกคนที่ยืนช่องเดียวกันเข้าสู่การซ่อนตัว ${q} ช่อง · บอสเลือกคนที่ซ่อนเป็นเป้าไม่ได้ (ยกเว้นท่าที่ตีทุกคน) · การโจมตีครั้งแรกที่ออกจากการซ่อน +${p} ดาเมจ`
        : `You and everyone sharing your slot hide for ${q} slots. The boss cannot single out a hidden fighter (AoE still lands), and the attack that breaks stealth deals +${p}.`;
    case 'Assassinate':
      return th
        ? `จ่ายเงา 2 — โจมตีบอส ${p} ดาเมจ ทะลุเกราะ · ถ้าบอสเหลือ HP ไม่ถึง 25% ดาเมจเพิ่มอีก 8`
        : `Spend 2 shadow: ${p} damage, ignoring armor. +8 more when the boss is at or below 25% HP.`;
    case 'Drain':
      return th
        ? `โจมตีบอส ${p} ดาเมจ และฟื้น HP ตัวเอง 1 — Morvane เป็นอันเดด รักษาด้วย Heal ไม่ได้ นี่คือทางฟื้นทางเดียวของเขา`
        : `Deal ${p} damage and restore 1 HP to yourself. Morvane is undead and cannot be healed — this is his only way back.`;
    case 'SoulSiphon':
      return th
        ? `โจมตีบอส ${p} ดาเมจ · ฟื้น HP ตัวเอง 2 · ได้วิญญาณ +1`
        : `Deal ${p} damage, restore 2 HP to yourself, and gain 1 soul.`;
    case 'RaiseDead':
      return th
        ? `ชุบเพื่อนที่ล้มแล้วให้กลับมาทันทีด้วย HP ${p}% ของสูงสุด แทนที่จะต้องรอ 6 ช่อง`
        : `Bring a downed ally back immediately at ${p}% of max HP, instead of waiting out the 6-slot revive.`;
    case 'DeathCoil':
      return th
        ? `จ่ายวิญญาณ 3 — โจมตีบอส ${p} ดาเมจ · เลือกจ่าย HP ตัวเอง 3 เพิ่มได้ เพื่อให้เป็น ${q} (จ่ายไม่ได้ถ้าจะทำให้ตัวเองตาย)`
        : `Spend 3 souls for ${p} damage. Optionally pay 3 of your own HP to make it ${q} — refused if that would kill you.`;
    // ── v0.4.5 ──
    case 'SightingShot':
      return th
        ? `โจมตีบอส ${p} ดาเมจ และได้ Focus +1 · Focus จ่ายได้ 1 ต่อ 1 เพื่อบวกแต้มเต๋าของ Sharp Shooting หรือ Trap! (จ่ายเท่าไหร่ก็ได้ที่มี · Focus ล้างทุกยกบอส)`
        : `Deal ${p} damage and bank 1 Focus. Focus is spent 1-for-1 as a flat bonus on Sharp Shooting's or Trap!'s d6 — spend as many as you hold. Focus is wiped between boss fights.`;
    case 'ManaDrain':
      return th
        ? `โจมตีบอส ${p} ดาเมจ และได้มานา +1 (สูงสุด 3) — นี่คือทางได้มานาทางเดียวของ Liora แล้ว: การชาร์จไม่ใช่เทิร์นที่เสียเปล่าอีกต่อไป`
        : `Deal ${p} damage and gain 1 mana (cap 3). This is now Liora's only mana source — charging up is no longer a wasted turn.`;
    case 'Freeze':
      return th
        ? `โจมตี ${p} ดาเมจ + ${q} ต่อมานา 1 หน่วยที่จ่าย (สูงสุด 3 → ${p + q * 3}) · แล้วทอย d6: ได้ 4 ขึ้นไป บอสติด ❄️ ช้า — หมากบอสถูกถอยลงไปอีก 2 ช่อง จึงลงมือช้าลง · ทอยไม่ผ่านก็ยังได้ดาเมจเต็ม`
        : `Deal ${p} damage +${q} per mana spent (up to 3 → ${p + q * 3}), then roll d6: on 4+ the boss is ❄️ Slowed — its pawn is pushed 2 slots further down the clock, so it acts later. A failed roll still deals full damage.`;
    case 'AuraShield':
      return th
        ? `ทันทีที่ประกาศ: เลือกใครก็ได้ (รวมตัวเอง) — ดาเมจที่เข้าคนนั้นลด ${q} จนถึงเทิร์นหน้าของ Liora · จ่ายมานาเพิ่มได้ 1 หน่วยต่อเกราะ +3 (พาสซีฟ ManaCharge) · การ์ดใบนี้ไม่ให้มานาแล้ว — มานามาจาก Mana Drain`
        : `On declare: pick anyone, yourself included — damage they take is reduced by ${q} until Liora's next turn. Pour in mana for +3 armor each (the ManaCharge passive). This card no longer grants mana; Mana Drain does.`;
    case 'HolySmite':
      return th
        ? `สกิลพื้นฐานของ Luna — โจมตีบอส ${p} ดาเมจ โดยไม่คิดเกราะของบอสเลย ⏱${s.time}`
        : `Luna's common attack — ${p} damage to the boss, ignoring its armor entirely. ⏱${s.time}.`;
    case 'Praying':
      return th
        ? `ตั้งสมาธิ ⏱${s.time} แล้วได้มานา +3 · มานาของ Luna ไม่มีเพดานและล้างใหม่ทุกยกบอส เธอเริ่มยกด้วย 5 · Heal จ่าย 2 ต่อครั้ง`
        : `Spend ⏱${s.time} in prayer for 3 mana. Luna's mana is uncapped and wiped between battles; she opens each one with 5, and every Heal costs 2.`;
    default:
      return '';
  }
}
