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
import type { RulesetVersion } from '@content/rulesets';
import type { ItemId } from '@content/items';
import type { ActiveAilment, AilmentId } from '@content/ailments';

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

  // ─────────────── v0.5 "camp" ruleset ───────────────
  /** Gems in hand. Granted at the end of each boss battle and spent in that same camp — they do
   *  NOT carry across camps (campPhase zeroes the pile at the end). That single rule is what keeps
   *  the camp from becoming a cross-battle optimisation problem, which is the thing that turns a
   *  55-minute game into a two-hour one (docs/DESIGN_VARIABLES.md §6.2). */
  gems: number;
  /** Consumable items held, spent as a free action during a visit. */
  items: ItemId[];
  /** Permanents bought; never removed. Kept separate from `items` so the free-action spend path
   *  can never accidentally consume one. */
  permanents: ItemId[];
  /** Victory points bought with leftover gems in the camp's third phase. Added to the score total
   *  at the end, tracked apart from scoreLog because it is not tied to any in-battle event. */
  boughtVp: number;
}

export type Phase = 'SETUP' | 'DRAFT' | 'BATTLE_INTRO' | 'CLOCK_RUN' | 'BATTLE_END' | 'CAMP' | 'SCORING' | 'ALL_LOSE';

export interface PendingAction {
  skillId: SkillId;
  declaredAtSlot: number;
  landedAtSlot: number;
  targetPlayerId?: PlayerId; // Heal, Guard
  manaSpent?: number; // Fireball / Meteor
  trapSlot?: number; // SetTrap (placed immediately; kept here for log/UI only)
  /** Death Coil's optional HP surcharge — paid at declare, but read again at resolve to pick the
   *  damage tier, so it has to survive on the pending action. */
  payHp?: boolean;
  /** True once this action's effect has already run — set by declareSkill for skills marked
   *  `immediate` in @content/characters (their damage/roll fires at declare, not at resolve).
   *  resolveFighterPending checks this and, when true, just frees the pawn without re-running
   *  anything — the pawn still walks its full ⏱ as normal, only the damage timing changed. */
  resolved?: boolean;
}

/** Eric's Guard: an active redirect link, not a shield. Lives on the battle rather than on either
 *  fighter because the effect is read from the *ward's* side (damage aimed at them lands on the
 *  guardian instead) while its lifetime is owned by the *guardian's* pawn. */
export interface GuardLink {
  guardianId: PlayerId;
  wardId: PlayerId;
  /** Flat reduction applied to redirected damage only. */
  reduction: number;
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
  /** Liora, 0..V045_LIORA_MANA_MAX. In the v0.4.5 ruleset Luna also runs on this field, uncapped
   *  and opening at V045_LUNA_START_MANA — one resource field, two economies, so nothing downstream
   *  (UI, save format, bots) needs a second concept. */
  mana: number;
  shield: Shield | null;
  /** Set the instant this fighter dies; cleared on revival. null once revival slot is computed
   *  but not yet reached is NOT how this works — see BattleState.deadWaiting below instead. */
  reviveAtSlot: number | null;
  everDiedThisBattle: boolean;
  attackCountThisBattle: number;
  /** Eric's eric3 ("บาดเจ็บสาหัสแต่ไม่ล้ม"): set the moment HP drops below half, never cleared for the
   *  rest of the battle — so a heal back to full doesn't erase the fact that he took the beating.
   *  Checked at declare/resolve time is wrong for this one on purpose; the condition is about the
   *  *history* of the battle, not its final frame. */
  everDroppedBelowHalfThisBattle: boolean;
  /** Liora's liora3: whether a Meteor of hers actually connected (>0 effective damage) this battle.
   *  Pairs with everDiedThisBattle so "survived" only scores when she also got her signature ⏱7
   *  spell off — the one the party is supposed to be protecting her through. */
  landedMeteorThisBattle: boolean;
  /** Total effective damage this fighter has put into the boss this battle. Ragorath's Frenzy
   *  (v0.3.14) hunts the maximum — the party's best damage dealer, not its weakest member. */
  damageDealtThisBattle: number;

  // ─────────────── v0.4.0 ───────────────
  // These are inert for the v0.3.x roster: only Chrono/Kage/Morvane ever write to them, and only
  // the v0.4.0 ruleset can draft those three. They live on every Fighter rather than in a side map
  // so nothing has to branch on ruleset just to read a fighter.

  /** Chrono's sand (0..SAND_MAX). Gained on every ⏱4+ declare via his Time Spiral passive, spent
   *  by Rewind. */
  sand: number;
  /** Kage's shadow (0..SHADOW_MAX). Gained on a visit where the boss did not touch him since his
   *  last one, spent by Assassinate. */
  shadow: number;
  /** Morvane's souls. Gained when a single hit costs him SOUL_HP_LOSS_THRESHOLD+ HP, and whenever
   *  anyone on the board goes down. Spent by Death Coil; every SOULS_PER_POINT scores morvane1. */
  souls: number;
  /** How many souls have already been paid out as morvane1 points, so the count-and-exchange only
   *  fires on each new completed set rather than re-scoring the whole pile. */
  soulsScored: number;
  /** Kage only: the clock slot at which Smoke Bomb's stealth lapses (marker counts down, so stealth
   *  holds while `marker > stealthUntilSlot`). null when not hidden. Set on any fighter sharing
   *  Kage's slot when he declares it, not just on Kage. */
  stealthUntilSlot: number | null;
  /** Set when a hidden fighter's next attack is still owed its Smoke Bomb bonus damage. Separate
   *  from `stealthUntilSlot` because stealth ends the moment they attack, but the bonus applies to
   *  that very attack. */
  stealthStrikeBonus: number;
  /** kage3: whether the boss has landed anything on this fighter at all this battle. Latched, never
   *  cleared — same "history not final frame" reasoning as everDroppedBelowHalfThisBattle. */
  everHitByBossThisBattle: boolean;
  /** Chrono's live call on the boss's next move (chrono1), declared alongside an action and
   *  cleared the next time the boss acts — whether or not it was right. */
  predictedBossMove: 'A' | 'B' | 'C' | null;
  /** v0.4.0 status ailments currently on this fighter. Always an array, even in the v0.3 ruleset
   *  where nothing ever writes to it, so no read site has to null-check. */
  ailments: ActiveAilment[];
  /** Set on the ally Haste moved this visit, so chrono2 can tell "dealt damage on the visit
   *  Chrono bought them" from ordinary damage. Cleared when that ally is next visited. */
  hastedByPlayerId: PlayerId | null;

  // ─────────────── v0.5 "camp" ruleset — live item effects ───────────────
  // All inert outside v0.5: nothing writes to them unless an item is spent. Kept on Fighter rather
  // than in a side table for the same reason as the v0.4.0 block above — no read site should have
  // to branch on ruleset.

  /** Flat bonus added to this fighter's next attack, then cleared (Power Elixir). */
  itemAtkBonus: number;
  /** Next attack ignores boss armor, then cleared (Armor Spike). */
  itemPierce: boolean;
  /** Cancels up to this much from the next hit that lands, then cleared (Bulwark Charm, Smoke
   *  Bomb). Distinct from `shield`, which skills own — an item must never overwrite a skill's. */
  itemAbsorb: number;
  /** Flat reduction on every hit until this fighter's next visit (Iron Tonic). */
  itemWard: number;
  /** ⏱ discount banked by a haste item this visit, applied to the very next declare then cleared.
   *  Lives on the fighter because the item is spent before the skill is chosen. */
  itemHaste: number;
  /** Permanents in play, copied from PlayerProgress at battle setup so the damage/revival paths can
   *  read them without reaching back into progress. */
  itemPermanents: ItemId[];

  // ─────────────── v0.4.5 rework ───────────────
  // Inert in the v0.3 ruleset, exactly like the v0.4.0 block above: nothing writes to them unless
  // hasV045Content() is true. On Fighter rather than in a side map for the same reason — no read
  // site should have to branch on ruleset just to look at a fighter.

  /** Kit's Focus. Banked 1 per Sighting Shot, spent 1-for-1 as a flat bonus on Sharp Shooting's and
   *  Trap!'s d6. Uncapped: each point already cost a whole ⏱2 turn, which is price enough. */
  focus: number;
  /** eric2 in the rework: how many times Guard has moved a hit off an ally onto this fighter this
   *  battle. Counted rather than scored per event — the condition is now a once-per-battle threshold
   *  (V045_ERIC_GUARD_SAVES_BAR), which is what stops it inflating with boss activity the way the
   *  uncapped v0.3 version did. */
  guardRedirectsThisBattle: number;
}

export interface TrapToken {
  slot: number;
  dmg: number;
  ownerId: PlayerId;
  /** v0.4.5: Focus Kit committed at declare, added to the spring roll. Carried on the token because
   *  the roll happens much later — inside the boss's action, when the boss stops on this slot — and
   *  Kit's Focus pool has moved on by then. */
  focusBonus?: number;
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
   *  the player it was originally aimed at — so the log reads "Eric took 12 (for Kit)" rather than
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
  /** v0.3.15: Kit's trap cut the boss down mid-lunge — the move was rolled and then cancelled, so
   *  the party sees what they just avoided. Carries the move it stopped for exactly that reason. */
  | { t: 'BOSS_MOVE_CANCELLED'; bossId: BossId; moveKey: 'A' | 'B' | 'C' }
  // ── v0.4.0 ailments ──
  | { t: 'AILMENT_APPLIED'; playerId: PlayerId; ailment: AilmentId }
  | { t: 'AILMENT_TICK'; playerId: PlayerId; ailment: AilmentId; dmg: number }
  | { t: 'AILMENT_EXPIRED'; playerId: PlayerId; ailment: AilmentId }
  | { t: 'AILMENT_CLEANSED'; playerId: PlayerId }
  /** Luna's Holy Water cancelled a single-target debuff aimed at her. */
  | { t: 'AILMENT_WARDED'; playerId: PlayerId; ailment: AilmentId }
  /** Chrono rewound the marker back up the clock. */
  | { t: 'MARKER_REWOUND'; playerId: PlayerId; slots: number; marker: number }
  /** Chrono called the boss's move correctly (chrono1). */
  | { t: 'PREDICTION_HIT'; playerId: PlayerId; moveKey: 'A' | 'B' | 'C' }
  /** Chrono dragged an ally's pawn up the clock. */
  | { t: 'HASTED'; playerId: PlayerId; targetId: PlayerId; slot: number }
  /** A fighter entered Kage's smoke. Logged per fighter, since it covers everyone sharing his slot. */
  | { t: 'STEALTH_ENTERED'; playerId: PlayerId; expiresAtSlot: number }
  | { t: 'STEALTH_BROKEN'; playerId: PlayerId }
  /** Morvane gained souls (from his own wounds, or from anyone going down). */
  | { t: 'SOULS_GAINED'; playerId: PlayerId; amount: number; total: number }
  // ── v0.4.5 ──
  /** Liora's Freeze landed ❄️ Slow: the boss's pawn was pushed `slots` further down the clock. */
  | { t: 'BOSS_SLOWED'; slots: number; toSlot: number }
  /** Mana banked from any source (Mana Drain, Praying, Luna's Divine Tithe). `total` is the pool
   *  after the gain, so the log alone is enough to audit an economy the sim cannot price. */
  | { t: 'MANA_GAINED'; playerId: PlayerId; amount: number; total: number }
  /** Kit banked or spent Focus. `amount` is signed — negative when it was paid into a roll. */
  | { t: 'FOCUS_CHANGED'; playerId: PlayerId; amount: number; total: number }
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
  traps: TrapToken[];
  scheduledHits: ScheduledHit[];
  /** v0.3.15: an owned, *timed* window instead of a bare flag. It used to last "until the boss's
   *  next action", which was a fine rule when the boss acted every other visit — after v0.3.14 the
   *  boss acts every visit, so the window was collapsing to almost nothing and Kit's whole opener
   *  role went with it (Sharp Shooting fell to 0.75 declares/game at hard, kit1 to 0.39 fires/win).
   *  Now it runs a fixed WEAK_POINT_SLOTS like Blessing does, and carries its owner so `kit2` can
   *  pay Kit when an ally cashes the window in. */
  /** `hitsPaid` counts how many ally-hit points kit1 has already paid out for THIS window — see
   *  KIT1_WINDOW_HIT_CAP in scoring.ts. Lives on the window rather than on Kit because it has to
   *  reset every time a new one opens, and the window is the thing that opens. */
  weakPoint: { ownerId: PlayerId; expiresAtSlot: number; hitsPaid: number } | null;
  /** v0.4.0: which move the boss is resolving right now, so the ailment attached to it can be
   *  looked up at each hit site. null outside a boss action. */
  currentMoveKey: 'A' | 'B' | 'C' | null;
  /** Blessing starts on declare and lasts exactly four clock slots, independent of Luna's pawn. */
  partyBuff: { atk: number; dmgReduction: number; ownerId: PlayerId; expiresAtSlot: number } | null;
  guard: GuardLink | null;
  /** Counts scoring plays by players other than Luna, for luna1 (v0.3.15). Lives on the battle so it
   *  resets each boss, matching kit3's per-battle count — at the table this is a small pile of cubes
   *  on her card that she cashes in fours. */
  allyScoresForLuna: number;
  /** v0.4.5 luna3: how many times *anyone* has gone down this battle. A count, not the per-fighter
   *  `everDiedThisBattle` flag, because the rework's luna3 slopes — each death costs 2 points — so a
   *  fighter who dies, revives and dies again has to cost twice. Reset every battle by prepareBattle,
   *  which is what distinguishes it from GameState.deathCounts (cumulative, for end-of-game stats). */
  deathsThisBattle: number;
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
  /** Which ruleset this game is being played under. Stored on the game rather than read from
   *  settings at each use site, so a save keeps the rules it was started with even if the menu
   *  selection changes later. */
  ruleset: RulesetVersion;
  /** Measurement-only roster override — see NewGameSetup.fixedRoster. null in every real game. */
  fixedRoster: CharId[] | null;
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
   *  this directly instead of counting `eric2`/`liora2` score entries, which only exist for Eric's
   *  and Liora-via-Meteor's own point conditions and miss every other character's (and every other
   *  Liora skill's) Last Shot entirely. `battle.finishedBy` itself resets to null every new battle
   *  (prepareBattle), so it has to be tallied here the instant each battle ends. */
  lastShotCounts: Partial<Record<PlayerId, number>>;
  pending: PendingDecision | null;

  // ─────────────── v0.5 "camp" ruleset ───────────────
  /** Face-down draw pile for the camp market. Empty unless the camp ruleset is on. */
  itemDeck: ItemId[];
  /** The cards currently for sale, face up. Refilled from `futureCard` the instant one is bought. */
  market: ItemId[];
  /** The one card everybody can see but nobody may buy yet — it slides into the market only when a
   *  purchase opens a slot. It exists so a buyer's decision is also a decision about what they are
   *  handing the next seat, which is the cheapest way to make a shared market interactive. */
  futureCard: ItemId | null;
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
  | { kind: 'PLACE_EXP'; playerId: PlayerId; bankedExp: number; skills: SkillId[]; expOnCard: Partial<Record<SkillId, number>> }
  // ─────────────── v0.5 camp ───────────────
  /** Camp phase 1. Offered one seat at a time in shopping order (fewest points first, character
   *  speed breaking ties), and re-offered to the same seat after every purchase so a player may buy
   *  as many cards as they can afford before the next seat starts. */
  | { kind: 'CAMP_BUY'; playerId: PlayerId; gems: number; market: ItemId[]; futureCard: ItemId | null }
  /** Camp phase 2, simultaneous: spend GEMS_PER_UPGRADE per skill card flipped to Lv2. */
  | { kind: 'CAMP_UPGRADE'; playerId: PlayerId; gems: number; upgradable: SkillId[] }
  /** Camp phase 3, simultaneous: convert whatever is left at GEMS_PER_VP:1. */
  | { kind: 'CAMP_VP'; playerId: PlayerId; gems: number };

export type Choice =
  | {
      kind: 'DECLARE_ACTION';
      /** Camp ruleset: consumables spent as a free action *before* the skill is declared — any number, no
       *  ⏱ cost. Folded into this choice rather than given its own yield so the turn order, the
       *  replay format and every bot keep working unchanged. */
      useItems?: { itemId: ItemId; targetPlayerId?: PlayerId }[];
      skillId: SkillId;
      targetPlayerId?: PlayerId;
      manaSpent?: number;
      trapSlot?: number;
      // ── v0.4.0 ──
      /** Morvane only: pay Death Coil's HP surcharge for its bigger damage tier. */
      payHp?: boolean;
      /** Chrono only: his call on the boss's next move, scored by chrono1 when the boss acts. */
      predictedBossMove?: 'A' | 'B' | 'C';
      /** v0.4.5, Kit only: Focus committed to this card's dice check, +1 to the die per point.
       *  Rejected by declareSkill unless the card is `focusSpendable` and he actually holds it. */
      focusSpent?: number;
    }
  | { kind: 'CHOOSE_CHARACTER'; charId: CharId }
  | { kind: 'PLACE_EXP'; allocations: { skillId: SkillId; count: number }[] }
  /** `itemId: null` means "done buying" and passes the turn to the next seat. */
  | { kind: 'CAMP_BUY'; itemId: ItemId | null }
  | { kind: 'CAMP_UPGRADE'; skillIds: SkillId[] }
  | { kind: 'CAMP_VP'; gemsSpent: number };
