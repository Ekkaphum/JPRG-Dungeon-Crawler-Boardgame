import {
  CHARACTERS,
  DEATH_COIL_HP_COST,
  SAND_PER_REWIND,
  SHADOW_PER_ASSASSINATE,
  SKILLS,
  SOULS_PER_DEATH_COIL,
} from '@content/characters';
import type { Choice, GameState, PendingDecision } from '@engine/index';

/** The boss rolls d6 and maps 1-3 to A, 4-5 to B, 6 to C, so A is the single most likely move at
 *  50%. chrono1 pays a flat 2 points whether the call was hard or easy, which makes naming A
 *  strictly correct every time — there is no read to make and no reason to vary it. Isolated here so
 *  the day a boss gets a different dice split, this is the only line that has to change. */
function bestBossMoveGuess(): 'A' | 'B' | 'C' {
  return 'A';
}

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

    if (def.kind === 'heal') {
      // A living target is required at declare time. If that target dies while Heal is pending,
      // resolution still fizzles normally under §5.5.
      const aliveTargets = battle.fighters.filter((f) => f.alive);
      for (const t of aliveTargets) out.push({ kind: 'DECLARE_ACTION', skillId, targetPlayerId: t.playerId });
    } else if (def.kind === 'guard') {
      // Guard protects someone else by definition — the caster is never a legal ward, and the
      // engine rejects a self-guard outright.
      const wards = battle.fighters.filter((f) => f.alive && f.playerId !== playerId);
      for (const t of wards) out.push({ kind: 'DECLARE_ACTION', skillId, targetPlayerId: t.playerId });
    } else if (def.kind === 'attackMana') {
      const maxMana = Math.min(fighter.mana, 3);
      for (let m = 0; m <= maxMana; m++) out.push({ kind: 'DECLARE_ACTION', skillId, manaSpent: m });
    } else if (def.kind === 'trap') {
      // Only the slots inside the skill's own window are legal now; if the window is full of other
      // traps there is nowhere to arm one, so the skill simply isn't offered.
      for (const slot of decision.options.trapSlots) out.push({ kind: 'DECLARE_ACTION', skillId, trapSlot: slot });
    } else if (def.kind === 'buffHaste') {
      const allies = battle.fighters.filter((f) => f.alive && f.playerId !== playerId);
      for (const t of allies) out.push({ kind: 'DECLARE_ACTION', skillId, targetPlayerId: t.playerId });
    } else if (def.kind === 'raise') {
      // Only a downed ally is a legal target; with none on the floor the card is simply not offered.
      const downed = battle.fighters.filter((f) => !f.alive && f.playerId !== playerId);
      for (const t of downed) out.push({ kind: 'DECLARE_ACTION', skillId, targetPlayerId: t.playerId });
    } else if (skillId === 'Rewind') {
      // Gated rather than filtered later: declaring it without the sand throws out of the engine.
      if (fighter.sand >= SAND_PER_REWIND) out.push({ kind: 'DECLARE_ACTION', skillId });
    } else if (skillId === 'Assassinate') {
      if (fighter.shadow >= SHADOW_PER_ASSASSINATE) out.push({ kind: 'DECLARE_ACTION', skillId });
    } else if (skillId === 'DeathCoil') {
      if (fighter.souls >= SOULS_PER_DEATH_COIL) {
        out.push({ kind: 'DECLARE_ACTION', skillId, payHp: false });
        if (fighter.hp > DEATH_COIL_HP_COST) out.push({ kind: 'DECLARE_ACTION', skillId, payHp: true });
      }
    } else {
      out.push({ kind: 'DECLARE_ACTION', skillId });
    }
  }

  // chrono1: the call on the boss's next move rides along with whatever Chrono declares and costs
  // him nothing, so a bot that never fills it in simply forfeits one of his three conditions. Every
  // candidate gets the same call rather than being enumerated three ways — which move to name is a
  // fixed-odds question with one right answer (see bestBossMoveGuess), not a per-card decision.
  if (player.charId === 'Chrono') {
    const guess = bestBossMoveGuess();
    for (const c of out) {
      if (c.kind === 'DECLARE_ACTION') c.predictedBossMove = guess;
    }
  }

  // Fallback: if every skill got filtered out for some edge-case reason (e.g. a last-survivor
  // Eric whose only untargeted options were filtered), offer the target-free attack skills
  // unconditionally so the game never stalls.
  if (out.length === 0) {
    for (const skillId of charDef.skills) {
      const def = SKILLS[skillId];
      if (def.kind === 'attack' || def.kind === 'attackGated' || def.kind === 'attackRoll' || def.kind === 'multiHit') {
        out.push({ kind: 'DECLARE_ACTION', skillId });
      }
    }
  }
  return out;
}
