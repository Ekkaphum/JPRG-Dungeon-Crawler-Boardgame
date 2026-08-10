import { CHARACTERS } from '@content/characters';
import type { RNG } from '../rng';
import { runDraft, prepareBattle } from './setup';
import { runClockBattle } from './walk';
import { grantEndOfBattleRewards, determineWinner } from './scoring';
import type { Choice, GameState, PendingDecision } from './types';

function* runExpPlacement(state: GameState): Generator<PendingDecision, void, Choice> {
  for (const p of state.players) {
    const prog = state.progress[p.id];
    if (prog.bankedExp <= 0) continue;
    const charDef = CHARACTERS[p.charId];
    const choice = yield {
      kind: 'PLACE_EXP',
      playerId: p.id,
      bankedExp: prog.bankedExp,
      skills: charDef.skills,
      expOnCard: { ...prog.expOnCard },
    };
    if (choice.kind !== 'PLACE_EXP') throw new Error(`expected PLACE_EXP for player ${p.id}`);
    let remaining = prog.bankedExp;
    for (const alloc of choice.allocations) {
      if (remaining <= 0) break;
      const current = prog.expOnCard[alloc.skillId] ?? 0;
      const capacity = Math.max(0, 3 - current);
      const applied = Math.min(alloc.count, capacity, remaining);
      if (applied <= 0) continue;
      prog.expOnCard[alloc.skillId] = current + applied;
      remaining -= applied;
      if (prog.expOnCard[alloc.skillId]! >= 3) prog.isLv2[alloc.skillId] = true;
    }
    prog.bankedExp = remaining;
  }
}

/** Top-level generator driving the whole game: draft (if not done yet) → 3 boss battles in order
 *  (EXP placement between battles 1→2 and 2→3) → final scoring. Mirrors the old engine's
 *  playGame() shape so session/driveGame.ts needs no changes. */
export function* playGame(state: GameState, rng: RNG): Generator<PendingDecision, GameState, Choice> {
  if (state.phase === 'DRAFT') {
    yield* runDraft(state, rng);
  }

  while (state.bossIndex < state.bossQueue.length) {
    state.phase = 'BATTLE_INTRO';
    prepareBattle(state);
    state.phase = 'CLOCK_RUN';
    yield* runClockBattle(state, rng);
    state.phase = 'BATTLE_END';

    if (state.battle!.outcome === 'clock_ran_out') {
      state.phase = 'ALL_LOSE';
      state.gameOver = { outcome: 'allLose', bossId: state.battle!.bossId };
      return state;
    }

    grantEndOfBattleRewards(state);
    const isLastBoss = state.bossIndex === state.bossQueue.length - 1;
    if (!isLastBoss) yield* runExpPlacement(state);
    state.bossIndex += 1;
  }

  state.phase = 'SCORING';
  const result = determineWinner(state);
  state.gameOver = { outcome: 'win', totals: result.totals, winnerId: result.winnerId, tieBreak: result.tieBreak };
  return state;
}
