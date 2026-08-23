import type { ClockLogEvent } from '@engine/index';
import { SKILLS } from './characters';
import { BOSSES } from './bosses3';
import { AILMENTS } from './ailments';
import { ITEMS } from './items';

function skillLabel(id: string): string {
  return id === 'BossMove' ? 'Boss' : SKILLS[id as keyof typeof SKILLS]?.name.th ?? id;
}

/** A declared action's landing slot can be 0 or negative if it's declared with little clock left —
 *  the battle ends the instant the marker reaches slot 0 (before anything there resolves — see
 *  walk.ts), so anything landing at 0 or below silently never resolves (by design, not a bug).
 *  Showing a raw non-positive number there just reads as broken, so every UI spot that displays a
 *  landing slot routes through this instead. */
export function landSlotDisplay(n: number): string {
  return n <= 0 ? '—' : String(n);
}

function who(id: number | 'boss'): string {
  return id === 'boss' ? '👹' : `P${id}`;
}

/** Single source of truth for how an engine event reads in Thai — shared by the scrolling battle
 *  log and the "what just happened" banner so the two can never drift apart. Returns null for
 *  events that carry no player-facing text (they still advance the clock/state). */
export function describeEvent(ev: ClockLogEvent): string | null {
  switch (ev.t) {
    case 'MARKER_TICK':
      return `— ช่อง ${ev.marker} —`;
    case 'DECLARE':
      return `${who(ev.playerId)} ประกาศ ${ev.label} → ลงช่อง ${landSlotDisplay(ev.landSlot)}`;
    case 'BOSS_MOVE': {
      const m = BOSSES[ev.bossId].moves.find((x) => x.key === ev.moveKey);
      return m ? `👹 ${m.name.th} — ${m.desc.th}` : null;
    }
    case 'BOSS_MOVE_CANCELLED': {
      // Names the move it stopped: this is the one moment the boss's intent becomes public since
      // v0.3.14, and seeing what was coming is half of what the trap actually bought.
      const m = BOSSES[ev.bossId].moves.find((x) => x.key === ev.moveKey);
      return m ? `🪤 กับดักตัดจังหวะ — ${m.name.th} ถูกยกเลิก` : null;
    }
    // ── v0.4.0 ──
    case 'AILMENT_APPLIED':
      return `${AILMENTS[ev.ailment].icon} ${who(ev.playerId)} ติด${AILMENTS[ev.ailment].name.th}`;
    case 'AILMENT_TICK':
      return `${AILMENTS[ev.ailment].icon} ${who(ev.playerId)} เสีย ${ev.dmg} HP จาก${AILMENTS[ev.ailment].name.th}`;
    case 'AILMENT_EXPIRED':
      return `${who(ev.playerId)} หายจาก${AILMENTS[ev.ailment].name.th}`;
    case 'AILMENT_CLEANSED':
      return `✨ ${who(ev.playerId)} ถูกชำระสถานะผิดปกติทั้งหมด`;
    case 'AILMENT_WARDED':
      // Named after the effect rather than after the passive: v0.3 grants this through Holy Water,
      // v0.4.5 through Divine Tithe, and the log has no business claiming a card the player cannot
      // find on their sheet.
      return `💧 พรคุ้มครองปัดป้อง${AILMENTS[ev.ailment].name.th}ให้ ${who(ev.playerId)}`;
    case 'MARKER_REWOUND':
      return `⏳ ${who(ev.playerId)} ย้อนเวลา — มาร์กเกอร์ถอยขึ้น ${ev.slots} ช่อง (เหลือ ${ev.marker})`;
    case 'PREDICTION_HIT':
      return `🔮 ${who(ev.playerId)} ทำนายท่าบอสถูก`;
    case 'HASTED':
      return `⚡ ${who(ev.playerId)} เร่ง ${who(ev.targetId)} ไปช่อง ${ev.slot}`;
    case 'STEALTH_ENTERED':
      return `🌫️ ${who(ev.playerId)} เข้าสู่การซ่อนตัว`;
    case 'STEALTH_BROKEN':
      return `🌫️ ${who(ev.playerId)} ออกจากการซ่อนตัว`;
    case 'SOULS_GAINED':
      return `💀 ${who(ev.playerId)} ได้วิญญาณ +${ev.amount} (รวม ${ev.total})`;
    // ── v0.4.5 ──
    case 'BOSS_SLOWED':
      return `❄️ บอสติดสถานะช้า — หมากบอสถอยลง ${ev.slots} ช่อง (ไปช่อง ${ev.toSlot})`;
    case 'MANA_GAINED':
      return `🔷 ${who(ev.playerId)} ได้มานา +${ev.amount} (รวม ${ev.total})`;
    case 'FOCUS_CHANGED':
      return ev.amount >= 0
        ? `🎯 ${who(ev.playerId)} ได้ Focus +${ev.amount} (รวม ${ev.total})`
        : `🎯 ${who(ev.playerId)} จ่าย Focus ${-ev.amount} (เหลือ ${ev.total})`;
    // ── v0.4.6 fractures ──
    case 'FRACTURE_CROSSED':
      return `💥 ${who(ev.playerId)} ทุบบอสผ่านรอยแตกที่ HP ${ev.hp} — ได้สิทธิ์รับ ${ITEMS[ev.itemId].name.th}`;
    case 'FRACTURE_CLAIMED':
      return ev.take === 'gems'
        ? `💰 ${who(ev.playerId)} รับรางวัลรอยแตกเป็นเจม +${ev.gems}`
        : `🎁 ${who(ev.playerId)} รับ ${ITEMS[ev.itemId].name.th} จากรอยแตก${ev.auto ? ' (อัตโนมัติ — จบยกก่อนได้เลือก)' : ''}`;
    case 'RESOLVE_ATTACK':
      return ev.wasted
        ? `${who(ev.playerId)} ${skillLabel(ev.skillId)} — เงื่อนไขไม่ครบ เสียฟรี`
        : `${who(ev.playerId)} ${skillLabel(ev.skillId)} → ${ev.targetId === 'boss' ? 'บอส' : `P${ev.targetId}`} -${ev.dmg}`;
    case 'RESOLVE_HEAL':
      return ev.wasted ? `P${ev.playerId} Heal — เป้าหมายไม่อยู่แล้ว เสียฟรี` : `P${ev.playerId} Heal → P${ev.targetId} +${ev.amount}`;
    case 'RESOLVE_BUFF':
      return `P${ev.playerId} ${skillLabel(ev.skillId)} หมดอายุ`;
    case 'RESOLVE_TRAP_TRIGGER':
      return ev.dmg > 0
        ? `🪤 กับดักช่อง ${ev.slot} ทำงาน (P${ev.ownerId}) → บอส -${ev.dmg}`
        : `🪤 กับดักช่อง ${ev.slot} สปริงไม่เข้า (P${ev.ownerId}) — เสียฟรี`;
    case 'RESOLVE_TRAP_EXPIRE':
      return `🪤 กับดักช่อง ${ev.slot} หมดอายุ`;
    case 'ROLL':
      return ev.purpose === 'boss move'
        ? `👹 ทอย d6 ได้ ${ev.die}`
        : `${who(ev.playerId)} ทอย ${ev.purpose} ได้ ${ev.die}${ev.target ? ` (ต้อง ${ev.target}+)` : ' (auto)'} → ${ev.success ? 'สำเร็จ' : 'พลาด'}`;
    case 'DEATH':
      return `💀 P${ev.playerId} ตายที่ช่อง ${ev.atSlot}${ev.reviveAtSlot != null ? ` — ฟื้นที่ช่อง ${ev.reviveAtSlot}` : ' — ไม่ฟื้นยกนี้'}`;
    case 'REVIVE':
      return `✨ P${ev.playerId} ฟื้นที่ช่อง ${ev.atSlot} (HP ${ev.hp})`;
    case 'SCORE':
      return `⭐ P${ev.entry.playerId} ได้ ${ev.entry.points} แต้ม (${ev.entry.conditionId})`;
    case 'BATTLE_START':
      return `⚔️ เริ่มยก: ${ev.bossId} (HP ${ev.hp})`;
    case 'BATTLE_END':
      if (ev.outcome === 'boss_defeated') return `🏆 ปราบบอสสำเร็จ! ${ev.finishedBy != null ? `(Last Shot: P${ev.finishedBy})` : ''}`;
      return ev.outcome === 'party_wiped' ? `☠ ทุกคนตายพร้อมกัน — บอสรอด` : `☠ นาฬิกาถึง 0 — บอสรอด`;
    default:
      return null;
  }
}

/** Player name substituted in, for the prominent banner (the log keeps the compact P0/P1 form). */
export function describeEventWithNames(ev: ClockLogEvent, nameOf: (id: number) => string): string | null {
  const raw = describeEvent(ev);
  if (raw == null) return null;
  return raw.replace(/P(\d+)/g, (_, d) => nameOf(Number(d)));
}
