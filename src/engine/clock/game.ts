import { charSkills } from '@content/characters';
import type { RNG } from '../rng';
import { runDraft, prepareBattle } from './setup';
import { runClockBattle } from './walk';
import { grantEndOfBattleRewards, determineWinner } from './scoring';
import { runCamp } from './camp';
import { hasCamp } from '@content/rulesets';
import type { Choice, GameState, PendingDecision } from './types';

function* runExpPlacement(state: GameState): Generator<PendingDecision, void, Choice> {
  for (const p of state.players) {
    const prog = state.progress[p.id];
    if (prog.bankedExp <= 0) continue;
    // charSkills(), not CHARACTERS[…].skills: the v0.4.5 ruleset hands three of the four core
    // characters a different kit, and EXP has to be placeable on the cards they are actually holding.
    const choice = yield {
      kind: 'PLACE_EXP',
      playerId: p.id,
      bankedExp: prog.bankedExp,
      skills: charSkills(p.charId, state.ruleset),
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

    // Anything other than a clean kill (clock running out, or the whole party down at once) ends
    // the run immediately — checked as "not boss_defeated" rather than enumerating every losing
    // outcome so a future one can't slip past this the way party_wiped almost did.
    if (state.battle!.outcome !== 'boss_defeated') {
      state.phase = 'ALL_LOSE';
      state.gameOver = { outcome: 'allLose', bossId: state.battle!.bossId };
      return state;
    }

    grantEndOfBattleRewards(state);
    const isLastBoss = state.bossIndex === state.bossQueue.length - 1;
    // v0.5 replaces the EXP-placement interlude with the full camp. The two are alternatives, not
    // layers: the camp's upgrade step does the same job (flipping a card to Lv2) with gems, so
    // running both would hand out the progression twice.
    if (!isLastBoss) {
      if (hasCamp(state.ruleset)) yield* runCamp(state, rng);
      else yield* runExpPlacement(state);
    }
    state.bossIndex += 1;
  }

  state.phase = 'SCORING';
  const result = determineWinner(state);
  state.gameOver = { outcome: 'win', totals: result.totals, winnerId: result.winnerId, tieBreak: result.tieBreak };
  return state;
}
