import { CHARACTERS } from '@content/characters';
import type { Choice, GameState, PendingDecision } from '@engine/index';

export function chooseCharacterDefault(decision: Extract<PendingDecision, { kind: 'CHOOSE_CHARACTER' }>, rand: () => number): Choice {
  const charId = decision.available[Math.floor(rand() * decision.available.length)];
  return { kind: 'CHOOSE_CHARACTER', charId };
}

/** Bots always spend every banked EXP token immediately, preferring to flip their first
 *  not-yet-Lv2 skill (attack skills first) rather than spreading thin. */
export function placeExpDefault(state: GameState, decision: Extract<PendingDecision, { kind: 'PLACE_EXP' }>): Choice {
  const charDef = CHARACTERS[state.players.find((p) => p.id === decision.playerId)!.charId];
  let remaining = decision.bankedExp;
  const allocations: { skillId: (typeof charDef.skills)[number]; count: number }[] = [];
  const order = [...charDef.skills].sort((a, b) => (decision.expOnCard[a] ?? 0) - (decision.expOnCard[b] ?? 0)).reverse();
  for (const skillId of order) {
    if (remaining <= 0) break;
    const capacity = 3 - (decision.expOnCard[skillId] ?? 0);
    if (capacity <= 0) continue;
    const put = Math.min(capacity, remaining);
    allocations.push({ skillId, count: put });
    remaining -= put;
  }
  return { kind: 'PLACE_EXP', allocations };
}
