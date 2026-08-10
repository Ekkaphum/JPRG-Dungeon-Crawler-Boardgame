// The clock walk — the whole game's core loop. See docs/10-v0.3.0-rulings.md and
// GAME_DESIGN_v0_3_0.md §4 for the rules this implements.

import { CHARACTERS, skillStats } from '@content/characters';
import type { RNG } from '../rng';
import { applySomnivarTax, declareSkill, processTrapsAtMarker, resolveFighterPending } from './skills';
import { declareBossAction, resolveBossPending } from './bossAI';
import { reviveFighter } from './damage';
import { onBattleEndScoring } from './scoring';
import type { Choice, DeclareOptions, Fighter, GameState, PendingDecision } from './types';

function buildDeclareOptions(state: GameState, fighter: Fighter): DeclareOptions {
  const battle = state.battle!;
  const occupied = new Set<number>();
  for (const f of battle.fighters) if (f.alive) occupied.add(f.slot);
  for (const t of battle.traps) occupied.add(t.slot);
  const emptySlotsBelowMarker: number[] = [];
  for (let s = 0; s < battle.marker; s++) if (!occupied.has(s)) emptySlotsBelowMarker.push(s);

  // Set Trap can only be armed inside the span the skill itself covers — between here and where
  // Kit's pawn lands — so it reads the boss's next stop rather than sniping anywhere on the clock.
  // Overlapping a fighter is fine (a trap sits on the track, not on a person); another trap isn't.
  const trapTime = applySomnivarTax(state, skillStats('SetTrap', !!state.progress[fighter.playerId]?.isLv2.SetTrap).time);
  const trapSlots: number[] = [];
  for (let s = battle.marker - 1; s > battle.marker - trapTime && s >= 0; s--) {
    if (!battle.traps.some((t) => t.slot === s)) trapSlots.push(s);
  }

  return {
    charId: fighter.charId,
    currentSlot: fighter.slot,
    mana: fighter.mana,
    maxManaSpend: Math.min(fighter.mana, 3),
    emptySlotsBelowMarker,
    trapSlots,
  };
}

/** Runs one battle's full clock walk (24 → 0), yielding a DECLARE_ACTION decision every time a
 *  live player pawn is visited. Bots must be resolved by the caller before calling gen.next() —
 *  see session/driveGame.ts, same pattern as the old engine. */
export function* runClockBattle(state: GameState, rng: RNG): Generator<PendingDecision, void, Choice> {
  const battle = state.battle!;

  while (true) {
    battle.marker -= 1;
    if (battle.marker < 0) {
      battle.outcome = 'clock_ran_out';
      battle.log.push({ t: 'BATTLE_END', outcome: 'clock_ran_out', finishedBy: null, expGranted: 0 });
      return;
    }
    battle.log.push({ t: 'MARKER_TICK', marker: battle.marker });

    processTrapsAtMarker(state, rng);
    if (battle.outcome !== 'in_progress') break;

    for (const f of battle.fighters) {
      if (!f.alive && f.reviveAtSlot === battle.marker) reviveFighter(state, f);
    }

    type QueueItem = { stackSeq: number; kind: 'player' | 'boss'; fighter?: Fighter };
    const queue: QueueItem[] = [];
    for (const f of battle.fighters) {
      if (f.alive && f.slot === battle.marker) queue.push({ stackSeq: f.stackSeq, kind: 'player', fighter: f });
    }
    if (battle.bossSlot === battle.marker) queue.push({ stackSeq: battle.bossStackSeq, kind: 'boss' });
    queue.sort((a, b) => a.stackSeq - b.stackSeq);

    for (const entry of queue) {
      if (battle.outcome !== 'in_progress') break;

      if (entry.kind === 'boss') {
        resolveBossPending(state, rng);
        if (battle.outcome !== 'in_progress') break;
        declareBossAction(state, rng);
        continue;
      }

      const f = entry.fighter!;
      if (!f.alive) continue;
      resolveFighterPending(state, f, rng);
      if (battle.outcome !== 'in_progress') break;
      if (!f.alive) continue;

      const options = buildDeclareOptions(state, f);
      const choice = yield { kind: 'DECLARE_ACTION', playerId: f.playerId, options };
      if (choice.kind !== 'DECLARE_ACTION') throw new Error(`expected DECLARE_ACTION for player ${f.playerId}`);
      declareSkill(state, f, choice);
    }
  }

  if (battle.outcome === 'boss_defeated') {
    onBattleEndScoring(state);
    battle.log.push({ t: 'BATTLE_END', outcome: 'boss_defeated', finishedBy: battle.finishedBy, expGranted: 0 });
  }
}

export function resetFighterForNewBattle(fighter: Fighter, charId: Fighter['charId']) {
  const def = CHARACTERS[charId];
  fighter.hp = def.hp;
  fighter.maxHp = def.hp;
  fighter.alive = true;
  fighter.slot = def.startSlot;
  fighter.pending = null;
  fighter.rollAttempt = {};
  fighter.mana = 0;
  fighter.shield = null;
  fighter.reviveAtSlot = null;
  fighter.everDiedThisBattle = false;
  fighter.attackCountThisBattle = 0;
}
