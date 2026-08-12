import { CHARACTERS, SKILLS } from '@content/characters';
import type { Choice, GameState, PendingDecision } from '@engine/index';

/** Enumerates every legal DECLARE_ACTION choice for the fighter currently being visited — shared
 *  by every bot tier so skill-specific plumbing (mana amounts, heal targets, trap slots) only
 *  lives in one place. */
export function declareCandidates(state: GameState, decision: Extract<PendingDecision, { kind: 'DECLARE_ACTION' }>): Choice[] {
  const playerId = decision.playerId;
  const player = state.players.find((p) => p.id === playerId)!;
  const charDef = CHARACTERS[player.charId];
  const battle = state.battle!;
  const fighter = battle.fighters.find((f) => f.playerId === playerId)!;
  const out: Choice[] = [];

  for (const skillId of charDef.skills) {
    const def = SKILLS[skillId];
    // Berserk is only worth offering when its HP<=5 gate is actually met right now — declaring it
    // otherwise just wastes the action (§5.5), so bots never pick it in that state.
    if (skillId === 'Berserk' && fighter.hp > 5) continue;

    if (def.kind === 'heal') {
      // A living target is required at declare time. If that target dies while Heal is pending,
      // resolution still fizzles normally under §5.5.
      const aliveTargets = battle.fighters.filter((f) => f.alive);
      for (const t of aliveTargets) out.push({ kind: 'DECLARE_ACTION', skillId, targetPlayerId: t.playerId });
    } else if (def.kind === 'attackMana') {
      const maxMana = Math.min(fighter.mana, 3);
      for (let m = 0; m <= maxMana; m++) out.push({ kind: 'DECLARE_ACTION', skillId, manaSpent: m });
    } else if (def.kind === 'trap') {
      // Only the slots inside the skill's own window are legal now; if the window is full of other
      // traps there is nowhere to arm one, so the skill simply isn't offered.
      for (const slot of decision.options.trapSlots) out.push({ kind: 'DECLARE_ACTION', skillId, trapSlot: slot });
    } else {
      out.push({ kind: 'DECLARE_ACTION', skillId });
    }
  }

  // Fallback: if every skill got filtered out for some edge-case reason (e.g. Heal with no alive
  // targets at all, which shouldn't happen since the caster itself is always alive+targetable),
  // just offer Berserk-free attack skills unconditionally so the game never stalls.
  if (out.length === 0) {
    for (const skillId of charDef.skills) {
      if (skillId === 'Berserk') continue;
      const def = SKILLS[skillId];
      if (def.kind === 'attack' || def.kind === 'attackRoll') out.push({ kind: 'DECLARE_ACTION', skillId });
    }
  }
  return out;
}
