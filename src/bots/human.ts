import type { Choice, GameState, PendingDecision } from '@engine/index';
import type { Agent } from './Agent';

/** Bridges a human player's UI click back into the engine's generator. */
export function createHumanAgent(id: number, onNeedDecision: (state: GameState, decision: PendingDecision) => void): Agent & {
  submit: (choice: Choice) => void;
} {
  let resolver: ((choice: Choice) => void) | null = null;
  return {
    id,
    decide(state, decision) {
      return new Promise<Choice>((resolve) => {
        resolver = resolve;
        onNeedDecision(state, decision);
      });
    },
    submit(choice: Choice) {
      if (!resolver) throw new Error('no pending human decision to submit');
      const r = resolver;
      resolver = null;
      r(choice);
    },
  };
}
