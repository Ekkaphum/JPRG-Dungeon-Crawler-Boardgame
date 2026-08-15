// v0.3.0 "clock" ruleset — core types. Pure data only (see old engine's own rule, kept here):
// no class instances, no functions on state objects, no Map/Set (arrays/records only) so state
// stays trivially serializable/loggable/replayable.
//
// Model: a 24-slot clock marker walks down from 24 to 0. 4 player pawns + 1 boss pawn share the
// track and can stack on the same slot. Visiting a pawn resolves whatever it declared last visit,
// then has it declare a new action, then moves it down by that action's ⏱. See
// docs/10-v0.3.0-rulings.md for the declare-immediate vs resolve-delayed split per skill.

import type { CharId, SkillId } from '@content/characters';
import type { BossId } from '@content/bosses3';
import type { Difficulty } from '@content/difficulty';

export type PlayerId = number; // 0..3, index into GameState.players / progress

export interface PlayerMeta {
  id: PlayerId;
  name: string;
  kind: 'human' | 'bot';
  botLevel?: 'easy' | 'medium' | 'hard';
  charId: CharId;
}

/** Persists across all 3 battles — this is the whole point of the EXP/Lv2 system. */
export interface PlayerProgress {
  playerId: PlayerId;
  charId: CharId;
  isLv2: Partial<Record<SkillId, boolean>>;
  /** EXP tokens placed on each skill card so far (0..2 — the 3rd flips it, see aftermath). */
  expOnCard: Partial<Record<SkillId, number>>;
  /** Unspent EXP tokens held in hand, not yet placed on a card. */
  bankedExp: number;
  /** Kit's Skill Improvement passive: each failed roll permanently improves only that skill.
   *  Sharp Shooting and Trap! have separate counters; both persist across boss battles. */
  rollPenalty: Partial<Record<'SharpShooting' | 'Trap', number>>;
}

export type Phase = 'SETUP' | 'DRAFT' | 'BATTLE_INTRO' | 'CLOCK_RUN' | 'BATTLE_END' | 'SCORING' | 'ALL_LOSE';

export interface PendingAction {
  skillId: SkillId;
  declaredAtSlot: number;
  landedAtSlot: number;
  targetPlayerId?: PlayerId; // Heal, Guard
  manaSpent?: number; // Fireball / Meteor
  trapSlot?: number; // SetTrap (placed immediately; kept here for log/UI only)
  /** True once this action's effect has already run — set by declareSkill for skills marked
   *  `immediate` in @content/characters (their damage/roll fires at declare, not at resolve).
   *  resolveFighterPending checks this and, when true, just frees the pawn without re-running
   *  anything — the pawn still walks its full ⏱ as normal, only the damage timing changed. */
  resolved?: boolean;
}

/** Matt's Guard: an active redirect link, not a shield. Lives on the battle rather than on either
 *  fighter because the effect is read from the *ward's* side (damage aimed at them lands on the
 *  guardian instead) while its lifetime is owned by the *guardian's* pawn. */
export interface GuardLink {
  guardianId: PlayerId;
  wardId: PlayerId;
  /** Flat reduction applied to redirected damage only. */
  reduction: number;
}

export interface BossPendingAction {
  moveKey: 'A' | 'B' | 'C';
  die: number;
  declaredAtSlot: number;
  landedAtSlot: number;
}

export interface Shield {
  kind: 'counter' | 'mana';
  reduction: number; // counter: percent 0-100; mana: flat amount
  counterDmg?: number; // counter only
  hitDuringWindow?: boolean; // counter only — did anything land on this fighter while shield active
}

export interface Fighter {
  playerId: PlayerId;
  charId: CharId;
  hp: number;
  maxHp: number;
  alive: boolean;
  slot: number;
  stackSeq: number;
  pending: PendingAction | null;
  /** Dice-ladder attempt counter per skill, resets every battle (§5.2). */
  rollAttempt: Partial<Record<SkillId, number>>;
  mana: number; // Vera only, 0..3
  shield: Shield | null;
  /** Set the instant this fighter dies; cleared on revival. null once revival slot is computed
   *  but not yet reached is NOT how this works — see BattleState.deadWaiting below instead. */
  reviveAtSlot: number | null;
  everDiedThisBattle: boolean;
  attackCountThisBattle: number;
  /** Matt's matt3 ("บาดเจ็บสาหัสแต่ไม่ล้ม"): set the moment HP drops below half, never cleared for the
   *  rest of the battle — so a heal back to full doesn't erase the fact that he took the beating.
   *  Checked at declare/resolve time is wrong for this one on purpose; the condition is about the
   *  *history* of the battle, not its final frame. */
  everDroppedBelowHalfThisBattle: boolean;
  /** Vera's vera3: whether she landed a hit at or above her vera1 impact threshold this battle.
   *  Pairs with everDiedThisBattle so "survived" only scores when she also did her job. Keyed on the
   *  damage threshold rather than the Meteor card specifically: requiring Meteor made the condition
   *  unreachable for a party that never gives her the room to cast it, which is exactly the party
   *  that is failing to protect her — it punished her twice for someone else's play. */
  landedBigHitThisBattle: boolean;
}

export interface TrapToken {
  slot: number;
  dmg: number;
  ownerId: PlayerId;
}

/** Kit's Multi Shot (kind: 'multiHit'): extra hits scheduled at declare time, fired without a roll
 *  when the marker reaches `slot`. The skill's own `primary` hit still lands normally through the
 *  caster's pending/resolve. All remaining hits are removed immediately if the caster dies. */
export interface ScheduledHit {
  slot: number;
  dmg: number;
  ownerId: PlayerId;
  skillId: SkillId;
}

export interface ScoreEntry {
  playerId: PlayerId;
  conditionId: string;
  points: number;
  atSlot: number;
  bossId: BossId;
}

export type ClockLogEvent =
  | { t: 'BATTLE_START'; bossId: BossId; hp: number }
  | { t: 'DECLARE'; playerId: PlayerId | 'boss'; slot: number; skillId: SkillId | 'BossMove'; landSlot: number; label: string; moveKey?: 'A' | 'B' | 'C' }
  /** The boss's declared move is taking effect. Emitted before its damage events so the UI can
   *  announce the move first, and — unlike RESOLVE_ATTACK — it fires even for moves that deal no
   *  damage at all (Golden Throne, Eternal Slumber). */
  | { t: 'BOSS_MOVE'; bossId: BossId; moveKey: 'A' | 'B' | 'C' }
  /** `targetId` is who actually *took* the damage. When Guard redirected it, `redirectedFrom` names
   *  the player it was originally aimed at — so the log reads "Matt took 12 (for Kit)" rather than
   *  silently reporting a hit on someone the boss never chose. */
  | {
      t: 'RESOLVE_ATTACK';
      playerId: PlayerId | 'boss';
      skillId: SkillId | 'BossMove';
      targetId: PlayerId | 'boss';
      dmg: number;
      wasted: boolean;
      redirectedFrom?: PlayerId;
    }
  | { t: 'RESOLVE_HEAL'; playerId: PlayerId; targetId: PlayerId; amount: number; wasted: boolean }
  | { t: 'RESOLVE_BUFF'; playerId: PlayerId; skillId: SkillId }
  | { t: 'RESOLVE_TRAP_TRIGGER'; slot: number; dmg: number; ownerId: PlayerId }
  | { t: 'RESOLVE_TRAP_EXPIRE'; slot: number }
  /** `target`/`success` are null for a roll that just selects an outcome rather than passing a
   *  check (the boss picking its move); `moveKey` says which move that roll landed on. */
  | { t: 'ROLL'; playerId: PlayerId | 'boss'; purpose: string; die: number; target: number | null; success: boolean | null; moveKey?: 'A' | 'B' | 'C' }
  | { t: 'DEATH'; playerId: PlayerId; atSlot: number; reviveAtSlot: number | null }
  | { t: 'REVIVE'; playerId: PlayerId; atSlot: number; hp: number }
  | { t: 'SCORE'; entry: ScoreEntry }
  | { t: 'MARKER_TICK'; marker: number }
  | { t: 'BATTLE_END'; outcome: 'boss_defeated' | 'clock_ran_out' | 'party_wiped'; finishedBy: PlayerId | null; expGranted: number };

export interface BattleState {
  bossId: BossId;
  bossHp: number;
  bossHpMax: number;
  armor: number;
  rage: number;
  marker: number;
  fighters: Fighter[];
  bossSlot: number;
  bossStackSeq: number;
  bossPending: BossPendingAction | null;
  traps: TrapToken[];
  scheduledHits: ScheduledHit[];
  weakPointActive: boolean;
  /** Blessing starts on declare and lasts exactly four clock slots, independent of Luna's pawn. */
  partyBuff: { atk: number; dmgReduction: number; ownerId: PlayerId; expiresAtSlot: number } | null;
  guard: GuardLink | null;
  finishedBy: PlayerId | null;
  finishedBySkill: SkillId | null;
  nextStackSeq: number;
  log: ClockLogEvent[];
  outcome: 'in_progress' | 'boss_defeated' | 'clock_ran_out' | 'party_wiped';
}

export interface GameState {
  phase: Phase;
  seed: number;
  rngState: number;
  difficulty: Difficulty;
  /** Fixed draft pick order chosen before the game; null means it was rolled randomly. */
  draftOrder: PlayerId[] | null;
  players: PlayerMeta[];
  progress: Record<PlayerId, PlayerProgress>;
  bossQueue: BossId[];
  bossIndex: number;
  battle: BattleState | null;
  scoreLog: ScoreEntry[];
  /** Cross-battle death tally per player, purely for end-of-game stats (§8's per-battle "everDied"
   *  flag resets every battle and isn't enough to report a whole game's death count). */
  deathCounts: Partial<Record<PlayerId, number>>;
  /** Cross-battle count of who actually landed the killing blow on a boss — the §1 tie-break reads
   *  this directly instead of counting `matt2`/`vera2` score entries, which only exist for Matt's
   *  and Vera-via-Meteor's own point conditions and miss every other character's (and every other
   *  Vera skill's) Last Shot entirely. `battle.finishedBy` itself resets to null every new battle
   *  (prepareBattle), so it has to be tallied here the instant each battle ends. */
  lastShotCounts: Partial<Record<PlayerId, number>>;
  pending: PendingDecision | null;
  gameOver:
    | { outcome: 'win'; totals: Record<PlayerId, number>; winnerId: PlayerId; tieBreak: 'points' | 'lastShots' | 'hp' | 'none' }
    | { outcome: 'allLose'; bossId: BossId }
    | null;
}

export interface DeclareOptions {
  charId: CharId;
  currentSlot: number;
  mana: number;
  maxManaSpend: number;
  emptySlotsBelowMarker: number[];
  /** Slots Set Trap may be armed on — only the ones inside the skill's own ⏱ window, so the trap
   *  is a read of where the boss will stop in the near term rather than anywhere on the clock. */
  trapSlots: number[];
}

export type PendingDecision =
  | { kind: 'DECLARE_ACTION'; playerId: PlayerId; options: DeclareOptions }
  | { kind: 'CHOOSE_CHARACTER'; playerId: PlayerId; available: CharId[] }
  | { kind: 'PLACE_EXP'; playerId: PlayerId; bankedExp: number; skills: SkillId[]; expOnCard: Partial<Record<SkillId, number>> };

export type Choice =
  | {
      kind: 'DECLARE_ACTION';
      skillId: SkillId;
      targetPlayerId?: PlayerId;
      manaSpent?: number;
      trapSlot?: number;
    }
  | { kind: 'CHOOSE_CHARACTER'; charId: CharId }
  | { kind: 'PLACE_EXP'; allocations: { skillId: SkillId; count: number }[] };
