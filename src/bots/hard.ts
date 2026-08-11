import type { Choice, GameState, PendingDecision } from '@engine/index';
import type { Agent } from './Agent';
import { declareCandidates } from './candidates';
import { chooseCharacterDefault, placeExpDefault } from './common';
import { comboSynergyBonus, estimateChoiceValue, scoreConditionBonus } from './heuristics';

/**
 * Same per-⏱ evaluation as the medium bot, plus a self-interest bonus toward its own score
 * conditions (see heuristics.ts) and a survival penalty when its own HP is critical. This is a
 * deliberately lighter "hard" tier than v0.2.0's Monte-Carlo rollout bot — full information
 * removes most of what that rollout existed to compensate for (there's no hidden state left to
 * simulate opponents' hands against), so the remaining edge over "medium" is mostly about not
 * being purely altruistic. See docs/10-v0.3.0-rulings.md and PLAN_v0.3.0.md M7 for the scope note.
 */
export function createHardBot(id: number, rand: () => number = Math.random): Agent {
  const epsilon = 0.05;
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
          const battle = state.battle!;
          const fighter = battle.fighters.find((f) => f.playerId === decision.playerId)!;
          const critical = fighter.hp <= fighter.maxHp * 0.25;

          const scored = candidates
            .map((c) => {
              let score =
                estimateChoiceValue(state, decision.playerId, c) +
                scoreConditionBonus(state, decision.playerId, c) +
                comboSynergyBonus(state, decision.playerId, c);
              const isDefensive = c.skillId === 'CounterAttack' || c.skillId === 'ManaCharge' || c.skillId === 'Heal';
              if (critical && isDefensive) score += 4;
              return { choice: c, score };
            })
            .sort((a, b) => b.score - a.score);

          if (scored.length > 1 && rand() < epsilon) return scored[1].choice;
          return scored[0].choice;
        }
      }
    },
  };
}
