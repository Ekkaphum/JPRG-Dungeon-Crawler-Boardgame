// Paced playback of the engine's event log.
//
// The engine resolves a whole burst of events between two player decisions (marker ticks, traps,
// one fighter's resolution, the boss's turn, ...). Showing the raw live state would make all of it
// land at once. Instead the UI renders a *display* copy of the battle that this module advances one
// event at a time, on a timer, so HP bars, pawn positions, damage popups and the action banner all
// move together with the log line describing them.
//
// Every burst ends with a hard resync to the true state (`cloneDisplay`), so the incremental
// `applyEventToDisplay` below only has to be right about the things it animates — secondary state
// it does not track (armor, rage, mana, buffs, shields) snaps to the correct value at rest and can
// never drift across bursts.

import type { BattleState, ClockLogEvent, GameState, SkillId } from '@engine/index';
import { BOSSES } from '@content/bosses3';
import { CHARACTERS, SKILLS } from '@content/characters';

export interface DamagePopup {
  id: number;
  target: 'boss' | number;
  amount: number;
  kind: 'damage' | 'heal';
}

/** Big skill-name card flashed over the middle of the board the moment an action actually lands.
 *  Carries identifiers rather than text so the component can render it in the current language. */
export type FlashTone = 'attack' | 'heal' | 'buff';
export type ActionFlashBody =
  | { source: 'skill'; skillId: SkillId; isLv2: boolean; tone: FlashTone }
  | { source: 'boss'; moveKey: 'A' | 'B' | 'C'; tone: FlashTone }
  | { source: 'roll'; die: number; target: number | null; success: boolean | null; moveKey?: 'A' | 'B' | 'C'; tone: FlashTone };
export type ActionFlash = ActionFlashBody & { id: number };

export const POPUP_MS = 1100;
/** Long enough to read a boss move's one-line description, not just its name. */
export const FLASH_MS = 1400;

/** Which events deserve a name flash. Attacks and heals flash when they *resolve*; buffs flash on
 *  DECLARE instead, because in this ruleset a buff's effect starts the instant it is declared and
 *  its RESOLVE event is the moment it *expires* (docs/10-v0.3.0-rulings.md §5). */
export function actionFlashFor(state: GameState, ev: ClockLogEvent): ActionFlashBody | null {
  const lv2 = (playerId: number, skillId: SkillId) => !!state.progress[playerId]?.isLv2[skillId];

  switch (ev.t) {
    // The boss announces itself via BOSS_MOVE, which fires even for moves that deal no damage —
    // its own RESOLVE_ATTACK events would otherwise flash the name once per target.
    case 'BOSS_MOVE':
      return { source: 'boss', moveKey: ev.moveKey, tone: 'attack' };
    case 'ROLL':
      return {
        source: 'roll',
        die: ev.die,
        target: ev.target,
        success: ev.success,
        moveKey: ev.moveKey,
        tone: ev.success === false ? 'attack' : ev.success === true ? 'heal' : 'buff',
      };
    case 'RESOLVE_ATTACK': {
      if (ev.playerId === 'boss' || ev.wasted || ev.dmg <= 0) return null;
      const skillId = ev.skillId as SkillId;
      return { source: 'skill', skillId, isLv2: lv2(ev.playerId, skillId), tone: 'attack' };
    }
    case 'RESOLVE_TRAP_TRIGGER':
      return { source: 'skill', skillId: 'Trap', isLv2: lv2(ev.ownerId, 'Trap'), tone: 'attack' };
    case 'RESOLVE_HEAL':
      if (ev.wasted || ev.amount <= 0) return null;
      return { source: 'skill', skillId: 'Heal', isLv2: lv2(ev.playerId, 'Heal'), tone: 'heal' };
    case 'DECLARE': {
      if (ev.playerId === 'boss' || ev.skillId === 'BossMove') return null;
      const skillId = ev.skillId as SkillId;
      const kind = SKILLS[skillId]?.kind;
      if (kind === 'buffParty' || kind === 'buffCounter' || kind === 'buffMana' || kind === 'guard') {
        return { source: 'skill', skillId, isLv2: lv2(ev.playerId, skillId), tone: 'buff' };
      }
      return null;
    }
    default:
      return null;
  }
}

/** How long to hold on an event before revealing the next one. Marker ticks are much faster than
 *  real actions — several empty slots in a row should slide by, not stall the battle. */
export function eventDelay(ev: ClockLogEvent, base: number): number {
  if (base <= 0) return 0;
  switch (ev.t) {
    case 'MARKER_TICK':
      return Math.round(base * 0.22);
    case 'ROLL':
      return Math.round(base * 0.7);
    case 'BATTLE_START':
    case 'BOSS_MOVE':
    case 'DECLARE':
    case 'RESOLVE_ATTACK':
    case 'RESOLVE_HEAL':
    case 'RESOLVE_TRAP_TRIGGER':
    case 'DEATH':
    case 'REVIVE':
    case 'SCORE':
    case 'BATTLE_END':
      return base;
    case 'RESOLVE_BUFF':
    case 'RESOLVE_TRAP_EXPIRE':
      return Math.round(base * 0.5);
    default:
      return 0;
  }
}

/** Every named sound effect the game can play, synthesized (no audio assets — see
 *  @ui/audio/AudioEngine) rather than sourced. */
export type SoundName =
  | 'tick'
  | 'hitBoss'
  | 'hitPlayer'
  | 'heal'
  | 'death'
  | 'revive'
  | 'weakPoint'
  | 'bossMove'
  | 'victory'
  | 'defeat'
  | 'score';

/** Which sound (if any) a resolved event should trigger. Pure and side-effect-free on purpose —
 *  the actual AudioContext calls live in the UI layer (@ui/audio) so this stays unit-testable
 *  without a browser, same split as popupFor/actionFlashFor above. MARKER_TICK is deliberately
 *  excluded: its "tick" cadence is driven separately by the marker value itself (speeding up near
 *  0), not by this per-event mapping. */
export function soundFor(ev: ClockLogEvent): Exclude<SoundName, 'tick'> | null {
  switch (ev.t) {
    case 'RESOLVE_ATTACK':
      if (ev.wasted || ev.dmg <= 0) return null;
      return ev.targetId === 'boss' ? 'hitBoss' : 'hitPlayer';
    case 'RESOLVE_TRAP_TRIGGER':
      return ev.dmg > 0 ? 'hitBoss' : null;
    case 'RESOLVE_HEAL':
      return !ev.wasted && ev.amount > 0 ? 'heal' : null;
    case 'DEATH':
      return 'death';
    case 'REVIVE':
      return 'revive';
    case 'ROLL':
      return ev.purpose.endsWith('weak point') && ev.success ? 'weakPoint' : null;
    case 'BOSS_MOVE':
      return 'bossMove';
    case 'SCORE':
      return 'score';
    case 'BATTLE_END':
      return ev.outcome === 'boss_defeated' ? 'victory' : 'defeat';
    default:
      return null;
  }
}

export function popupFor(ev: ClockLogEvent): Omit<DamagePopup, 'id'> | null {
  switch (ev.t) {
    case 'RESOLVE_ATTACK':
      if (ev.wasted || ev.dmg <= 0) return null;
      return { target: ev.targetId, amount: ev.dmg, kind: 'damage' };
    case 'RESOLVE_TRAP_TRIGGER':
      if (ev.dmg <= 0) return null;
      return { target: 'boss', amount: ev.dmg, kind: 'damage' };
    case 'RESOLVE_HEAL':
      if (ev.wasted || ev.amount <= 0) return null;
      return { target: ev.targetId, amount: ev.amount, kind: 'heal' };
    case 'REVIVE':
      return { target: ev.playerId, amount: ev.hp, kind: 'heal' };
    default:
      return null;
  }
}

/** The battle as it looked the instant it began — the baseline the whole log replays onto. */
export function initialDisplayBattle(battle: BattleState): BattleState {
  const bossDef = BOSSES[battle.bossId];
  return {
    ...battle,
    bossHp: battle.bossHpMax,
    armor: bossDef.armor,
    rage: 0,
    marker: 24,
    bossSlot: bossDef.startSlot,
    bossStackSeq: battle.fighters.length,
    bossPending: null,
    traps: [],
    scheduledHits: [],
    weakPointActive: false,
    partyBuff: null,
    guard: null,
    finishedBy: null,
    finishedBySkill: null,
    outcome: 'in_progress',
    log: [],
    fighters: battle.fighters.map((f, i) => {
      const def = CHARACTERS[f.charId];
      return {
        ...f,
        hp: def.hp,
        maxHp: def.hp,
        alive: true,
        slot: def.startSlot,
        stackSeq: i,
        pending: null,
        rollAttempt: {},
        mana: 0,
        shield: null,
        reviveAtSlot: null,
        everDiedThisBattle: false,
        attackCountThisBattle: 0,
      };
    }),
  };
}

/** Deep-enough copy of the true battle for the UI to render, minus the log (the session serves the
 *  paced slice of that separately). */
export function cloneDisplay(battle: BattleState): BattleState {
  return {
    ...battle,
    log: [],
    traps: battle.traps.map((t) => ({ ...t })),
    scheduledHits: battle.scheduledHits.map((h) => ({ ...h })),
    partyBuff: battle.partyBuff ? { ...battle.partyBuff } : null,
    guard: battle.guard ? { ...battle.guard } : null,
    bossPending: battle.bossPending ? { ...battle.bossPending } : null,
    fighters: battle.fighters.map((f) => ({
      ...f,
      pending: f.pending ? { ...f.pending } : null,
      shield: f.shield ? { ...f.shield } : null,
      rollAttempt: { ...f.rollAttempt },
    })),
  };
}

export function applyEventToDisplay(b: BattleState, ev: ClockLogEvent) {
  const fighter = (id: number) => b.fighters.find((f) => f.playerId === id);

  switch (ev.t) {
    case 'MARKER_TICK':
      b.marker = ev.marker;
      if (b.partyBuff && b.marker <= b.partyBuff.expiresAtSlot) b.partyBuff = null;
      break;

    case 'DECLARE': {
      if (ev.playerId === 'boss') {
        b.bossSlot = ev.landSlot;
        b.bossPending = { moveKey: ev.moveKey ?? 'A', die: 0, declaredAtSlot: ev.slot, landedAtSlot: ev.landSlot };
      } else {
        const f = fighter(ev.playerId);
        if (f) {
          f.slot = ev.landSlot;
          f.pending = { skillId: ev.skillId as SkillId, declaredAtSlot: ev.slot, landedAtSlot: ev.landSlot };
        }
      }
      break;
    }

    case 'BOSS_MOVE':
      // The declared move is spent, and the weak point closes the moment the boss acts.
      b.bossPending = null;
      b.weakPointActive = false;
      break;

    case 'RESOLVE_ATTACK': {
      if (ev.playerId !== 'boss') {
        const src = fighter(ev.playerId);
        // Multi Shot's early hits (skills.ts's scheduledHits) also emit RESOLVE_ATTACK for this
        // player without going through their `pending` at all — only clear it once the marker has
        // actually reached where their declared action lands, so an early hit doesn't make the UI
        // think the pawn has nothing pending several slots before its real resolve.
        if (src && src.pending && b.marker === src.pending.landedAtSlot) src.pending = null;
      }
      if (ev.wasted) break;
      if (ev.targetId === 'boss') {
        b.bossHp = Math.max(0, b.bossHp - ev.dmg);
      } else {
        const t = fighter(ev.targetId);
        if (t) t.hp = Math.max(0, t.hp - ev.dmg);
      }
      break;
    }

    case 'RESOLVE_HEAL': {
      const src = fighter(ev.playerId);
      if (src) src.pending = null;
      if (ev.wasted) break;
      const t = fighter(ev.targetId);
      if (t) t.hp = Math.min(t.maxHp, t.hp + ev.amount);
      break;
    }

    case 'RESOLVE_BUFF': {
      const f = fighter(ev.playerId);
      if (f) {
        f.pending = null;
        f.shield = null;
      }
      if (b.partyBuff?.ownerId === ev.playerId) b.partyBuff = null;
      if (b.guard?.guardianId === ev.playerId) b.guard = null;
      break;
    }

    case 'RESOLVE_TRAP_TRIGGER':
      b.bossHp = Math.max(0, b.bossHp - ev.dmg);
      b.traps = b.traps.filter((t) => t.slot !== ev.slot);
      if (ev.dmg > 0) b.bossPending = null; // a failed roll (dmg 0) neither hurts nor cancels
      break;

    case 'RESOLVE_TRAP_EXPIRE':
      b.traps = b.traps.filter((t) => t.slot !== ev.slot);
      break;

    case 'DEATH': {
      const f = fighter(ev.playerId);
      if (f) {
        f.alive = false;
        f.hp = 0;
        f.pending = null;
        f.shield = null;
        f.reviveAtSlot = ev.reviveAtSlot;
        b.scheduledHits = b.scheduledHits.filter((h) => h.ownerId !== ev.playerId);
        // Mirror the engine: the pawn moves to where it will come back, and a dead guardian's
        // Guard link drops (killFighter does the same on the true state).
        if (ev.reviveAtSlot != null) f.slot = ev.reviveAtSlot;
        if (b.guard?.guardianId === ev.playerId) b.guard = null;
      }
      break;
    }

    case 'REVIVE': {
      const f = fighter(ev.playerId);
      if (f) {
        f.alive = true;
        f.hp = ev.hp;
        f.reviveAtSlot = null;
        f.slot = ev.atSlot;
      }
      break;
    }

    case 'BATTLE_END':
      b.outcome = ev.outcome;
      b.finishedBy = ev.finishedBy;
      break;
  }
}

/** Number of SCORE events already in this battle's log — lets the session rewind its "revealed
 *  score" counter to the start of the battle before replaying it. */
export function scoreEventCount(battle: BattleState): number {
  return battle.log.reduce((n, e) => n + (e.t === 'SCORE' ? 1 : 0), 0);
}

export function battleOf(state: GameState): BattleState | null {
  return state.battle;
}
