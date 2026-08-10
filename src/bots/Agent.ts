import type { Choice, GameState, PendingDecision } from '@engine/index';

/** Every agent (human UI or bot) implements this, nothing more. v0.3.0 has no hidden information
 *  (GAME_DESIGN_v0_3_0.md §4.4), so — unlike v0.2.0 — agents read the raw GameState directly,
 *  no redaction layer needed. */
export interface Agent {
  readonly id: number;
  decide(state: GameState, decision: PendingDecision): Promise<Choice>;
}
