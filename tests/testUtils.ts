import { createRNG, newGame, playGame, type Choice, type GameState, type NewGameSetup, type PendingDecision } from '@engine/index';
import { createEasyBot } from '@bots/easy';
import type { Agent } from '@bots/Agent';
import { CHAR_IDS, type CharId } from '@content/characters';

/** Builds a 4-player game with a fixed, known Matt/Kit/Vera/Luna → player 0..3 assignment,
 *  bypassing the random draft so tests can address "Matt's fighter" deterministically. */
export function fixedDraftState(seed = 12345): GameState {
  const state = newGame(
    {
      players: [
        { name: 'P0', kind: 'bot' },
        { name: 'P1', kind: 'bot' },
        { name: 'P2', kind: 'bot' },
        { name: 'P3', kind: 'bot' },
      ],
      difficulty: 'standard',
    },
    seed
  );
  state.players.forEach((p, i) => {
    p.charId = CHAR_IDS[i]; // Matt, Kit, Vera, Luna in that order
    state.progress[p.id] = { playerId: p.id, charId: p.charId, isLv2: {}, expOnCard: {}, bankedExp: 0, rollPenalty: 0 };
  });
  state.phase = 'BATTLE_INTRO';
  return state;
}

/** Swaps a player's character before prepareBattle() builds fighters off it — for testing Dax/Mira
 *  (or any character) without needing a real 6-character draft. Must be called before
 *  prepareBattle(), not after, or the fighter will still be built from the old character's stats. */
export function setPlayerCharacter(state: GameState, playerId: number, charId: CharId) {
  const player = state.players.find((p) => p.id === playerId)!;
  player.charId = charId;
  state.progress[playerId] = { playerId, charId, isLv2: {}, expOnCard: {}, bankedExp: 0, rollPenalty: 0 };
}

export function fourEasyBotSetup(): NewGameSetup {
  return {
    players: [
      { name: 'A', kind: 'bot', botLevel: 'easy' },
      { name: 'B', kind: 'bot', botLevel: 'easy' },
      { name: 'C', kind: 'bot', botLevel: 'easy' },
      { name: 'D', kind: 'bot', botLevel: 'easy' },
    ],
    difficulty: 'standard',
  };
}

/** Drives a full game to completion using easy bots for every seat — deterministic given `seed`. */
export async function playFullGame(seed: number, setup: NewGameSetup = fourEasyBotSetup()): Promise<GameState> {
  const rng = createRNG(seed);
  const state = newGame(setup, seed);
  const agents: Agent[] = setup.players.map((_, i) => createEasyBot(i, createRNG(seed + i + 1).next));
  const gen = playGame(state, rng);
  let res = gen.next();
  while (!res.done) {
    const decision: PendingDecision = res.value;
    const agent = agents.find((a) => a.id === decision.playerId)!;
    const choice: Choice = await agent.decide(state, decision);
    res = gen.next(choice);
  }
  return res.value;
}
