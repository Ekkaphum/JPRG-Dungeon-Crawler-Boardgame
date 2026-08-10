import { playGame, type GameState, type RNG } from '@engine/index';
import type { Agent } from '@bots/Agent';

/**
 * Drives the engine's generator to completion (or until the caller stops awaiting), routing each
 * PendingDecision to the right Agent. v0.3.0 has no hidden information (GAME_DESIGN_v0_3_0.md
 * §4.4), so agents read the raw GameState directly — no redaction step like v0.2.0 had.
 */
export async function driveGame(state: GameState, rng: RNG, agents: Agent[]): Promise<GameState> {
  const gen = playGame(state, rng);
  let res = gen.next();
  while (!res.done) {
    const decision = res.value;
    state.pending = decision;
    const agent = agents.find((a) => a.id === decision.playerId);
    if (!agent) throw new Error(`no agent registered for player ${decision.playerId}`);
    const choice = await agent.decide(state, decision);
    state.pending = null;
    res = gen.next(choice);
  }
  return res.value;
}
