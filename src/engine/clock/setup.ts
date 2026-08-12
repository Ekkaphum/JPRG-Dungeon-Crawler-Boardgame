import type { RNG } from '../rng';
import { CHAR_IDS, CHARACTERS, type CharId } from '@content/characters';
import { BOSS_IDS, BOSSES } from '@content/bosses3';
import { DIFFICULTY_MULTIPLIER, type Difficulty } from '@content/difficulty';
import type { GameState, PlayerMeta, PlayerId, Choice, PendingDecision } from './types';

export interface NewGameSetup {
  players: { name: string; kind: 'human' | 'bot'; botLevel?: 'easy' | 'medium' | 'hard' }[]; // exactly 4
  difficulty: Difficulty;
  /** Seat order for the character draft. Null = roll it randomly at the table (the default). */
  draftOrder?: PlayerId[] | null;
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
    charId: 'Matt', // placeholder — overwritten by runDraft()
  }));
  return {
    phase: 'DRAFT',
    seed,
    rngState: seed,
    difficulty: setup.difficulty,
    draftOrder: setup.draftOrder ?? null,
    players,
    progress: {},
    bossQueue: [...BOSS_IDS],
    bossIndex: 0,
    battle: null,
    scoreLog: [],
    deathCounts: {},
    lastShotCounts: {},
    pending: null,
    gameOver: null,
  };
}

/**
 * Draft generator — randomizes pick order, then yields CHOOSE_CHARACTER decisions one at a time
 * in that order (GAME_DESIGN_v0_3_0.md §3.1: "ลำดับการเลือกคือสิ่งที่มีค่าจริง ไม่ใช่ตัวละคร"). The last
 * player to pick gets whichever character is left, no decision needed.
 */
export function* runDraft(state: GameState, rng: RNG): Generator<PendingDecision, void, Choice> {
  // A chosen order is honoured as-is; otherwise the table rolls for it.
  const order = state.draftOrder ?? rng.shuffle(state.players.map((p) => p.id));
  let available: CharId[] = [...CHAR_IDS];
  for (const playerId of order) {
    if (available.length === 1) {
      assignCharacter(state, playerId, available[0]);
      available = [];
      continue;
    }
    const choice = yield { kind: 'CHOOSE_CHARACTER', playerId, available: [...available] };
    if (choice.kind !== 'CHOOSE_CHARACTER' || !available.includes(choice.charId)) {
      throw new Error(`Invalid draft choice for player ${playerId}`);
    }
    assignCharacter(state, playerId, choice.charId);
    available = available.filter((c) => c !== choice.charId);
  }
  state.phase = 'BATTLE_INTRO';
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
  };
}

/** Fresh per-battle fighter state for every player, boss reset to its 4-player HP. */
export function prepareBattle(state: GameState) {
  const bossId = state.bossQueue[state.bossIndex];
  const bossDef = BOSSES[bossId];
  const hp = Math.round(bossDef.hp * DIFFICULTY_MULTIPLIER[state.difficulty]);
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
    bossPending: null,
    traps: [],
    weakPointActive: false,
    partyBuff: null,
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
        mana: 0,
        shield: null,
        reviveAtSlot: null,
        everDiedThisBattle: false,
        attackCountThisBattle: 0,
      };
    }),
  };
  // stackSeq must be unique and increasing in placement order; players are all "placed" before the
  // battle starts, so give them sequential seq numbers starting after the boss's.
  state.battle.fighters.forEach((f, i) => {
    f.stackSeq = i;
  });
  state.battle.nextStackSeq = state.battle.fighters.length + 1;
}
