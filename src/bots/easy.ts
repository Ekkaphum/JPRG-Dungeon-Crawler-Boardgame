import type { Choice, GameState, PendingDecision } from '@engine/index';
import type { Agent } from './Agent';
import { declareCandidates } from './candidates';
import { chooseCharacterDefault, placeExpDefault } from './common';

/** "มือใหม่ที่ตื่นเต้น" — picks uniformly at random among legal candidates, no evaluation at all. */
export function createEasyBot(id: number, rand: () => number = Math.random): Agent {
  return {
    id,
    async decide(state: GameState, decision: PendingDecision): Promise<Choice> {
      switch (decision.kind) {
        case 'CHOOSE_CHARACTER':
          return chooseCharacterDefault(decision, rand);
        case 'PLACE_EXP':
          return placeExpDefault(state, decision);
        case 'DECLARE_ACTION': {
          const candidates = declareCandidates(state, decision);
          return candidates[Math.floor(rand() * candidates.length)];
        }
      }
    },
  };
}
