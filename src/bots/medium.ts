import type { Choice, GameState, PendingDecision } from '@engine/index';
import type { Agent } from './Agent';
import { declareCandidates } from './candidates';
import { chooseCharacterDefault, placeExpDefault } from './common';
import { comboSynergyBonus, estimateChoiceValue } from './heuristics';

/** Picks the best-scoring candidate by estimateChoiceValue(), with a little noise so two medium
 *  bots don't play identically. No score-condition self-interest — plays purely for the party,
 *  which is exactly why it *does* get the combo-timing awareness from comboSynergyBonus(): lining
 *  up weak point / Blessing with a teammate's big hit is party-good, not self-interested. */
export function createMediumBot(id: number, rand: () => number = Math.random): Agent {
  const epsilon = 0.12;
  return {
    id,
    async decide(state: GameState, decision: PendingDecision): Promise<Choice> {
      switch (decision.kind) {
        case 'CHOOSE_CHARACTER':
          return chooseCharacterDefault(decision, rand);
        case 'PLACE_EXP':
          return placeExpDefault(state, decision);
        case 'DECLARE_ACTION': {
          const candidates = declareCandidates(state, decision) as Extract<Choice, { kind: 'DECLARE_ACTION' }>[];
          const scored = candidates
            .map((c) => ({ choice: c, score: estimateChoiceValue(state, decision.playerId, c) + comboSynergyBonus(state, decision.playerId, c) }))
            .sort((a, b) => b.score - a.score);
          if (scored.length > 1 && rand() < epsilon) return scored[1].choice;
          return scored[0].choice;
        }
      }
    },
  };
}
