import type { Choice, GameState, PendingDecision } from '@engine/index';
import type { Agent } from './Agent';
import { declareCandidates } from './candidates';
import { autoClaimFractures, autoUseItems, campBuyDefault, campUpgradeDefault, campVpDefault, chooseCharacterDefault, placeExpDefault } from './common';

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
        case 'CAMP_BUY':
          return campBuyDefault(decision);
        case 'CAMP_UPGRADE':
          return campUpgradeDefault(decision);
        case 'CAMP_VP':
          return campVpDefault(decision);
        case 'DECLARE_ACTION': {
          const candidates = declareCandidates(state, decision);
          const pick = candidates[Math.floor(rand() * candidates.length)];
          if (pick.kind !== 'DECLARE_ACTION') return pick;
          // v0.4.6: bounties are claimed before items, so a card won this visit can be spent on it.
          const fractureTakes = autoClaimFractures(decision);
          // Matched on `index` rather than positionally: `index` is the fracture LINE's index on the
          // track, and fractureClaims only holds the lines this player is actually owed.
          const incoming = fractureTakes
            .filter((f) => f.take === 'item')
            .map((f) => decision.options.fractureClaims.find((c) => c.index === f.index)!.itemId);
          const useItems = autoUseItems(state, decision.playerId, incoming);
          return {
            ...pick,
            ...(useItems.length > 0 ? { useItems } : {}),
            ...(fractureTakes.length > 0 ? { fractureTakes } : {}),
          };
        }
      }
    },
  };
}
