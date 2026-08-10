import { SKILLS, skillStats } from '@content/characters';
import type { Choice, GameState } from '@engine/index';

/** Rough per-⏱ value estimate for a candidate DECLARE_ACTION choice. Fully deterministic where
 *  the doc's numbers are deterministic (this ruleset hides nothing — GAME_DESIGN_v0_3_0.md §4.4)
 *  — the only genuine unknowns are QuickShot's dice roll and the boss's next d6, which this just
 *  prices in as a flat expected-value bonus rather than simulating forward. */
export function estimateChoiceValue(state: GameState, playerId: number, choice: Extract<Choice, { kind: 'DECLARE_ACTION' }>): number {
  const battle = state.battle!;
  const fighter = battle.fighters.find((f) => f.playerId === playerId)!;
  const isLv2 = !!state.progress[playerId]?.isLv2[choice.skillId];
  const stats = skillStats(choice.skillId, isLv2);
  const def = SKILLS[choice.skillId];
  const timeCost = battle.bossId === 'Somnivar' && stats.time >= 5 ? stats.time + 2 : stats.time;
  const buffAtk = (battle.partyBuff?.atk ?? 0) + (battle.weakPointActive ? 4 : 0);

  let value: number;
  switch (def.kind) {
    case 'attack': {
      const hits = choice.skillId === 'TwinShot' ? (stats.secondary ?? 1) : 1;
      const armor = choice.skillId === 'Smite' ? 0 : battle.armor;
      value = Math.max(0, stats.primary! + buffAtk - armor) * hits;
      break;
    }
    case 'attackGated': {
      value = Math.max(0, stats.primary! + buffAtk - battle.armor);
      break;
    }
    case 'attackRoll': {
      value = Math.max(0, stats.primary! + buffAtk - battle.armor) + 2.5; // + chance to open a weak point
      break;
    }
    case 'attackMana': {
      const total = stats.primary! + stats.secondary! * (choice.manaSpent ?? 0) + buffAtk;
      value = Math.max(0, total - battle.armor);
      break;
    }
    case 'heal': {
      const target = battle.fighters.find((f) => f.playerId === choice.targetPlayerId);
      if (!target) return -Infinity;
      const missing = target.maxHp - target.hp;
      const urgency = target.hp / target.maxHp < 0.35 ? 2 : 1;
      value = Math.min(stats.primary!, missing) * 1.4 * urgency;
      break;
    }
    case 'buffCounter':
      value = fighter.hp < fighter.maxHp * 0.6 ? 7 : 2.5;
      break;
    case 'buffParty':
      value = 9; // whole-party buff, generally strong regardless of state
      break;
    case 'buffMana':
      value = fighter.mana < 3 ? 4.5 : 2;
      break;
    case 'trap': {
      // The boss's pawn only moves on its own turn, so a trap armed exactly on the slot it is
      // sitting on is certain to connect; anywhere else is a near-certain waste. Beyond the
      // damage, connecting rolls to wipe the boss's declared move — worth roughly what that move
      // would have dealt, discounted by the ladder's odds.
      // Nothing declared yet (the opening tick) means there is nothing to cancel, so the trap is
      // reduced to its small damage and is not worth the ⏱.
      if (choice.trapSlot !== battle.bossSlot || !battle.bossPending) return 0.2;
      value = stats.primary! + 5;
      break;
    }
    default:
      value = 0;
  }
  return value / Math.max(1, timeCost);
}

/** Extra nudge toward a bot's own personal score conditions — without this, heuristic bots play
 *  purely for the party's survival and never compete for points the way the doc's human players
 *  are expected to (see docs/10-v0.3.0-rulings and the v0.2.0 lesson in HANDOFF.md §15.4 about
 *  "too-safe" bots making the game trivially easy for the human). */
export function scoreConditionBonus(state: GameState, playerId: number, choice: Extract<Choice, { kind: 'DECLARE_ACTION' }>): number {
  const battle = state.battle!;
  const fighter = battle.fighters.find((f) => f.playerId === playerId)!;
  const player = state.players.find((p) => p.id === playerId)!;
  let bonus = 0;

  if (player.charId === 'Matt') {
    if (choice.skillId === 'Berserk') bonus += 2; // big hit, likely clears the >10-dmg condition
    if (choice.skillId === 'Slash' && battle.bossHp <= 20) bonus += 1; // angling for Last Shot
  }
  if (player.charId === 'Vera') {
    if (choice.skillId === 'Meteor' && battle.bossHp <= 30) bonus += 3; // angling for the Meteor-finish bonus
  }
  if (player.charId === 'Kit') {
    if (choice.skillId === 'QuickShot') bonus += 1; // cheap ⏱, stacks attack count toward cond3
  }
  if (player.charId === 'Luna') {
    if (choice.skillId === 'Heal' && choice.targetPlayerId !== playerId) bonus += 0.5;
  }
  void fighter;
  return bonus;
}
