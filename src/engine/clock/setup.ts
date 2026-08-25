import type { RNG } from '../rng';
import { CHAR_IDS, CHARACTERS, type CharId } from '@content/characters';
import { ALL_BOSS_IDS, BOSSES, CLASSIC_BOSS_IDS, LONG_RUN_BOSS_COUNT, SINS_BOSS_IDS, hpForAct, type BossId } from '@content/bosses';
import { DIFFICULTY_MULTIPLIER, type Difficulty } from '@content/difficulty';
import { STABLE_RULESET, hasFractures, hasV040Content, hasV045Content, type RulesetVersion } from '@content/rulesets';
import { initCamp } from './camp';
import { MAMMORAX_START_HOARD } from './bossRules';
import { rollFractures } from './fracture';
import { V040_CHAR_IDS, V045_LUNA_START_MANA } from '@content/characters';
import { createRNG } from '../rng';
import type { GameMode, GameState, PlayerMeta, PlayerId, Choice, PendingDecision } from './types';

export interface NewGameSetup {
  players: { name: string; kind: 'human' | 'bot'; botLevel?: 'easy' | 'medium' | 'hard' }[]; // exactly 4
  difficulty: Difficulty;
  /** Seat order for the character draft. Null = roll it randomly at the table (the default). */
  draftOrder?: PlayerId[] | null;
  /** Defaults to the stable ruleset when omitted, so every existing caller (tests, the sim tool,
   *  old saves) keeps its current behaviour without being touched. */
  ruleset?: RulesetVersion;
  /** **Measurement only.** Assigns characters to seats directly and skips the draft entirely,
   *  including the human-only gate on the v0.4.0 roster.
   *
   *  This exists so the balance sim can hold three characters constant and swap exactly one — the
   *  only way to attribute a change in win rate to that character rather than to who got drafted.
   *  The *set* is pinned; seat order is still rolled per game, because seat order is worth ~20pp on
   *  its own (see runDraft) and would otherwise swamp the comparison. It is never set by the app:
   *  `startNewGame` does not pass it, so no real game can reach it, and a bot can still never
   *  *choose* an experimental character. Length must equal the player count. */
  fixedRoster?: CharId[];

  /** Which run structure to play. Defaults to 'classic' so every existing caller — the ~130 tests,
   *  the balance sim, an old save being replayed — keeps the tuned three-boss queue it has always
   *  had without being touched. */
  mode?: GameMode;
  /** Free mode's chosen queue. Ignored in the other two modes. Anything shorter or longer than
   *  LONG_RUN_BOSS_COUNT is padded/trimmed rather than rejected, because a half-filled picker in the
   *  UI must still be able to start a game. */
  bossQueue?: BossId[];
}

/** Builds the boss queue for a run.
 *
 *  'sins5' draws from a stream forked off the seed rather than from the game's own RNG: the queue
 *  has to be decided before the first `createRNG(seed)` the session makes, and consuming from that
 *  same stream here would shift every roll in the game after it — which would silently change what
 *  a replayed seed does. Forking keeps a seed reproducible *and* leaves the existing streams alone.
 *
 *  The five drawn sins are then sorted by their designed act (`tier`), so a random draw still
 *  escalates. Without it a run can open on the finale and close on the tutorial boss, which is five
 *  random fights rather than a campaign. */
export function buildBossQueue(mode: GameMode, seed: number, chosen?: BossId[]): BossId[] {
  if (mode === 'classic') return [...CLASSIC_BOSS_IDS];
  if (mode === 'sins5') {
    const rng = createRNG((seed ^ 0x5155eed) >>> 0);
    const drawn = rng.sample(SINS_BOSS_IDS, LONG_RUN_BOSS_COUNT);
    return [...drawn].sort((a, b) => BOSSES[a].tier - BOSSES[b].tier);
  }
  // Free: honour the order the table picked — the whole point of the mode is that the queue is
  // theirs. Deduplicated (the same boss twice would share one meter set), then topped up from the
  // full roster in act order so a partly-filled picker still starts.
  const seen: BossId[] = [];
  for (const id of chosen ?? []) if (!seen.includes(id)) seen.push(id);
  const filler = [...ALL_BOSS_IDS].sort((a, b) => BOSSES[a].tier - BOSSES[b].tier);
  for (const id of filler) {
    if (seen.length >= LONG_RUN_BOSS_COUNT) break;
    if (!seen.includes(id)) seen.push(id);
  }
  return seen.slice(0, LONG_RUN_BOSS_COUNT);
}

/** Builds the initial GameState with no character assigned yet — draft happens via runDraft(). */
export function newGame(setup: NewGameSetup, seed: number): GameState {
  if (setup.players.length !== 4) {
    throw new Error('v0.3.0 is 4-players-only (GAME_DESIGN_v0_3_0.md §1/§12)');
  }
  const players: PlayerMeta[] = setup.players.map((p, i) => ({
    id: i,
    name: p.name,
    kind: p.kind,
    botLevel: p.botLevel,
    charId: 'Eric', // placeholder — overwritten by runDraft()
  }));
  return {
    phase: 'DRAFT',
    seed,
    rngState: seed,
    difficulty: setup.difficulty,
    ruleset: setup.ruleset ?? STABLE_RULESET,
    fixedRoster: setup.fixedRoster ?? null,
    draftOrder: setup.draftOrder ?? null,
    players,
    progress: {},
    mode: setup.mode ?? 'classic',
    bossQueue: buildBossQueue(setup.mode ?? 'classic', seed, setup.bossQueue),
    bossIndex: 0,
    battle: null,
    scoreLog: [],
    deathCounts: {},
    lastShotCounts: {},
    pending: null,
    itemDeck: [],
    market: [],
    futureCard: null,
    gameOver: null,
  };
}

/**
 * Draft generator — randomizes pick order, then yields CHOOSE_CHARACTER decisions one at a time
 * in that order (GAME_DESIGN_v0_3_0.md §3.1: "ลำดับการเลือกคือสิ่งที่มีค่าจริง ไม่ใช่ตัวละคร"). The last
 * player to pick gets whichever character is left, no decision needed.
 */
export function* runDraft(state: GameState, rng: RNG): Generator<PendingDecision, void, Choice> {
  // Measurement path: the character *set* is pinned, but which seat gets which is still rolled.
  //
  // Assigning them by index looked simpler and was wrong: seat order decides stackSeq, which decides
  // who resolves first when pawns share a slot, and that alone is worth ~20 percentage points of win
  // rate. Measured with the identical four characters — Eric/Kit/Liora/Luna by seat scored 39.3%
  // while Luna/Liora/Kit/Eric scored 59.3%. Pinning the order would therefore have folded a seat
  // effect twice the size of the thing being measured into every comparison.
  if (state.fixedRoster) {
    const shuffled = rng.shuffle([...state.fixedRoster]);
    for (const p of state.players) assignCharacter(state, p.id, shuffled[p.id]);
    state.phase = 'BATTLE_INTRO';
    return;
  }
  // A chosen order is honoured as-is; otherwise the table rolls for it.
  const order = state.draftOrder ?? rng.shuffle(state.players.map((p) => p.id));
  let taken: CharId[] = [];
  for (const playerId of order) {
    const available = draftPoolFor(state, playerId).filter((c) => !taken.includes(c));
    if (available.length === 0) {
      throw new Error(`No characters left for player ${playerId}`);
    }
    // Auto-assign only when this seat genuinely has no decision left. Checked per seat rather than
    // globally because the pools differ: with v0.4.0 the last bot can be down to one legal pick
    // while a human seat still has several, and vice versa.
    if (available.length === 1) {
      assignCharacter(state, playerId, available[0]);
      taken = [...taken, available[0]];
      continue;
    }
    const choice = yield { kind: 'CHOOSE_CHARACTER', playerId, available: [...available] };
    if (choice.kind !== 'CHOOSE_CHARACTER' || !available.includes(choice.charId)) {
      throw new Error(`Invalid draft choice for player ${playerId}`);
    }
    assignCharacter(state, playerId, choice.charId);
    taken = [...taken, choice.charId];
  }
  state.phase = 'BATTLE_INTRO';
}

/** Which characters a given seat may draft. The v0.4.0 three are gated twice over: the ruleset has
 *  to include them at all, and the seat has to be a human. Bots are excluded on purpose — their
 *  heuristics price a skill by damage-per-⏱ and cannot see sand, shadow, souls, stealth, or a marker
 *  rewind, so a bot holding one would play it badly and any sim run on it would be measuring the
 *  bot rather than the character (docs/EXPANSION_DESIGN.md §4.2). */
export function draftPoolFor(state: GameState, playerId: PlayerId): CharId[] {
  const player = state.players.find((p) => p.id === playerId);
  const canTakeNew = hasV040Content(state.ruleset) && player?.kind === 'human';
  return canTakeNew ? [...CHAR_IDS, ...V040_CHAR_IDS] : [...CHAR_IDS];
}

function assignCharacter(state: GameState, playerId: PlayerId, charId: CharId) {
  const player = state.players.find((p) => p.id === playerId)!;
  player.charId = charId;
  state.progress[playerId] = {
    playerId,
    charId,
    isLv2: {},
    expOnCard: {},
    bankedExp: 0,
    rollPenalty: {},
    // v0.5 camp — zeroed for every ruleset; only campPhase ever writes to them.
    gems: 0,
    items: [],
    permanents: [],
    boughtVp: 0,
  };
}

/** Fresh per-battle fighter state for every player, boss reset to its 4-player HP.
 *
 *  `rng` is optional only because ~130 existing tests call this as `prepareBattle(state)` to build
 *  a board and never touch randomness. It is needed for exactly one thing: the v0.4.6 fracture draw,
 *  which shuffles the item deck on the first battle and pops two cards off it. Without one, a fracture
 *  battle simply starts with no fracture lines — which is the right failure for a test that never
 *  asked for them, and why fracture.ts iterates `battle.fractures` everywhere instead of indexing
 *  it. Every real caller (playGame) passes it. */
export function prepareBattle(state: GameState, rng?: RNG) {
  const bossId = state.bossQueue[state.bossIndex];
  const bossDef = BOSSES[bossId];
  // Classic keeps the exact numbers its 5,000-game sim was run on. The two long modes read the
  // per-act HP column off the boss sheet instead (docs/BOSS_SERIES_DESIGN.md §1) — an act ① boss is
  // a different fight from the same boss in act ⑤, and printing one number for both was what made
  // the old three-boss queue impossible to extend.
  const baseHp = state.mode === 'classic' ? bossDef.hp : hpForAct(bossId, state.bossIndex + 1);
  const hp = Math.round(baseHp * DIFFICULTY_MULTIPLIER[state.difficulty]);
  state.battle = {
    bossId,
    bossHp: hp,
    bossHpMax: hp,
    armor: bossDef.armor,
    rage: 0,
    marker: 24,
    bossSlot: bossDef.startSlot,
    // Placed "after" any player at the same slot — ties always resolve player-before-boss
    // (GAME_DESIGN_v0_3_0.md §4.1 "เสมอกันในกอง → ผู้เล่นเล่นก่อนบอสเสมอ"). Boss starts at slot 22,
    // same as Luna — this ordering is what makes Luna act before the boss on turn 1.
    bossStackSeq: state.players.length,
    traps: [],
    scheduledHits: [],
    fractures: [],
    // Every boss opens on its first sheet; only Aurelius and the Queen have a second one.
    phase: 1,
    // Seven Sins / Chess meters. Mammorax is the only one that does not start at zero: his hoard
    // *is* his defence, so a fresh pile of 8 is his equivalent of printed armor (§3.7).
    envy: 0,
    slotsSinceBuff: 0,
    hoard: bossId === 'Mammorax' ? MAMMORAX_START_HOARD : 0,
    swallowedId: null,
    swallowedTurns: 0,
    swallowDamage: 0,
    offer: null,
    pawnRank: 0,
    colorFlipped: false,
    bossTurnSkipped: false,
    bossPawns: [],
    foreseenMove: null,
    weakPoint: null,
    currentMoveKey: null,
    partyBuff: null,
    guard: null,
    allyScoresForLuna: 0,
    deathsThisBattle: 0,
    finishedBy: null,
    finishedBySkill: null,
    nextStackSeq: 0,
    // Log the difficulty-adjusted HP the battle actually starts with, not the base stat.
    log: [{ t: 'BATTLE_START', bossId, hp }],
    outcome: 'in_progress',
    fighters: state.players.map((p) => {
      const def = CHARACTERS[p.charId];
      return {
        playerId: p.id,
        charId: p.charId,
        hp: def.hp,
        maxHp: def.hp,
        alive: true,
        slot: def.startSlot,
        stackSeq: 0, // reassigned below once we know boss.bossStackSeq ordering
        pending: null,
        rollAttempt: {},
        // v0.4.5: Luna opens every battle already able to act as a cleric instead of spending her
        // first two turns earning the right to. Wiped and re-granted here each battle, never
        // carried — banking mana is a bet on *this* fight, not a stockpile across the game.
        mana: hasV045Content(state.ruleset) && p.charId === 'Luna' ? V045_LUNA_START_MANA : 0,
        shield: null,
        reviveAtSlot: null,
        everDiedThisBattle: false,
        attackCountThisBattle: 0,
        everDroppedBelowHalfThisBattle: false,
        landedMeteorThisBattle: false,
        damageDealtThisBattle: 0,
        // v0.4.0 — inert unless a v0.4.0 character is drafted.
        sand: 0,
        shadow: 0,
        souls: 0,
        soulsScored: 0,
        stealthUntilSlot: null,
        stealthStrikeBonus: 0,
        everHitByBossThisBattle: false,
        predictedBossMove: null,
        hastedByPlayerId: null,
        ailments: [],
        // v0.5 — inert unless the camp ruleset is on and an item is actually bought.
        itemAtkBonus: 0,
        itemPierce: false,
        itemAbsorb: 0,
        itemWard: 0,
        itemHaste: 0,
        itemPermanents: [...(state.progress[p.id]?.permanents ?? [])],
        // v0.4.5 — inert unless the rework is on. All three reset per battle: Focus and the tithe
        // carry are in-battle economies, and eric2's counter is a per-battle threshold.
        focus: 0,
        guardRedirectsThisBattle: 0,
        // Series meters — all inert unless one of the nine new bosses is in the queue.
        buffsReceivedThisBattle: 0,
        healReceivedThisBattle: 0,
        goldRobbedThisBattle: 0,
        offersAcceptedThisBattle: 0,
        refusedStandingOffer: false,
        enthralledTurns: 0,
      };
    }),
  };
  // stackSeq must be unique and increasing in placement order; players are all "placed" before the
  // battle starts, so give them sequential seq numbers starting after the boss's.
  state.battle.fighters.forEach((f, i) => {
    f.stackSeq = i;
  });
  state.battle.nextStackSeq = state.battle.fighters.length + 1;

  // Last, so the BATTLE_START log entry and the whole board already exist when the bounties are
  // laid out. initCamp is idempotent and normally runs at the first camp; fractures need the deck one
  // battle earlier, and calling it here means the deck is shuffled exactly once either way.
  if (hasFractures(state.ruleset) && rng) {
    initCamp(state, rng);
    state.battle.fractures = rollFractures(state);
  }
}
