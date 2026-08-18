// The clock walk — the whole game's core loop. See docs/10-v0.3.0-rulings.md and
// GAME_DESIGN_v0_3_0.md §4 for the rules this implements.

import { CHARACTERS } from '@content/characters';
import type { RNG } from '../rng';
import { declareSkill, expireTimedEffectsAtMarker, legalTrapSlots, processScheduledHitsAtMarker, processTrapsAtMarker, resolveFighterPending } from './skills';
import { declareBossAction } from './bossAI';
import { reviveFighter } from './damage';
import { onBattleEndScoring } from './scoring';
import type { Choice, DeclareOptions, Fighter, GameState, PendingDecision } from './types';

/** Who resolves first when two pawns share a clock slot. GAME_DESIGN_v0_3_0.md §4.1: "หมากซ้อนช่อง
 *  เดียวกันได้ — วางก่อนอยู่ล่างกอง = เล่นก่อน · เสมอกันในกอง → ผู้เล่นเล่นก่อนบอสเสมอ" (stacked pawns —
 *  placed first = bottom of the stack = resolves first; tied → the player always goes before the
 *  boss). "Tied" here isn't a near-miss on stackSeq — a player vs. the boss is *never* ordered by
 *  arrival time at all, only by stackSeq among players when several of them share a slot. Exported
 *  so the walk loop and TimelineBar's visual stacking read the same rule instead of two that can
 *  drift (this used to be a bare `a.stackSeq - b.stackSeq` sort — since bossStackSeq is drawn from
 *  the same global counter as every player's, a boss that re-declared and landed on a slot before a
 *  player later stacked onto it would get a *lower* stackSeq and wrongly resolve first). */
export function resolveOrderCompare(a: { stackSeq: number; isBoss?: boolean }, b: { stackSeq: number; isBoss?: boolean }): number {
  if (!!a.isBoss !== !!b.isBoss) return a.isBoss ? 1 : -1;
  return a.stackSeq - b.stackSeq;
}

/** Resolves a fighter's previous declare (if any) then asks for a new one — the one full "visit"
 *  a player pawn gets whenever the marker reaches its slot. Pulled out so both the tick's normal
 *  queue and the post-boss-move sweep below (§4.1 fix, item 7) share the exact same visit logic. */
function* resolvePlayerVisit(state: GameState, f: Fighter, rng: RNG): Generator<PendingDecision, void, Choice> {
  const battle = state.battle!;
  resolveFighterPending(state, f, rng);
  if (battle.outcome !== 'in_progress') return;
  if (!f.alive) return;
  const options = buildDeclareOptions(state, f);
  const choice = yield { kind: 'DECLARE_ACTION', playerId: f.playerId, options };
  if (choice.kind !== 'DECLARE_ACTION') throw new Error(`expected DECLARE_ACTION for player ${f.playerId}`);
  declareSkill(state, f, choice, rng);
}

function buildDeclareOptions(state: GameState, fighter: Fighter): DeclareOptions {
  const battle = state.battle!;
  const occupied = new Set<number>();
  for (const f of battle.fighters) if (f.alive) occupied.add(f.slot);
  for (const t of battle.traps) occupied.add(t.slot);
  const emptySlotsBelowMarker: number[] = [];
  for (let s = 0; s < battle.marker; s++) if (!occupied.has(s)) emptySlotsBelowMarker.push(s);

  return {
    charId: fighter.charId,
    currentSlot: fighter.slot,
    mana: fighter.mana,
    maxManaSpend: Math.min(fighter.mana, 3),
    emptySlotsBelowMarker,
    // Set Trap can only be armed inside the span the skill itself covers — between here and where
    // Kit's pawn lands — so it reads the boss's next stop rather than sniping anywhere on the clock.
    // Overlapping a fighter is fine (a trap sits on the track, not on a person); another trap isn't.
    trapSlots: legalTrapSlots(state, fighter),
  };
}

/** Runs one battle's full clock walk (24 → 0), yielding a DECLARE_ACTION decision every time a
 *  live player pawn is visited. Bots must be resolved by the caller before calling gen.next() —
 *  see session/driveGame.ts, same pattern as the old engine. */
export function* runClockBattle(state: GameState, rng: RNG): Generator<PendingDecision, void, Choice> {
  const battle = state.battle!;

  while (true) {
    battle.marker -= 1;
    if (battle.marker <= 0) {
      // GAME_DESIGN_v0_3_0.md §1/§4.2: "นาฬิกาถึงช่อง 0 โดยบอสยังไม่ตาย" / "มาร์กเกอร์ถึง 0 → บอสชนะ"
      // — reaching slot 0 with the boss still alive ends the battle immediately. Slot 0 is never
      // itself playable: no traps, revives, or declared actions resolve there. Previously this only
      // triggered once the marker went *negative* (`< 0`), so a killing blow, trap trigger, or
      // revive landing exactly at slot 0 still counted — reaching 0 was survivable, contradicting
      // "ถึงช่อง 0" reading as "arrives at 0", not "passes 0".
      battle.log.push({ t: 'MARKER_TICK', marker: 0 });
      battle.outcome = 'clock_ran_out';
      battle.log.push({ t: 'BATTLE_END', outcome: 'clock_ran_out', finishedBy: null, expGranted: 0 });
      return;
    }
    battle.log.push({ t: 'MARKER_TICK', marker: battle.marker });

    // Fixed-duration buffs expire before traps, scheduled hits, player visits or the boss can use
    // them at this slot. Blessing declared at N therefore covers exactly N→N-4, not Luna's return.
    expireTimedEffectsAtMarker(state);

    processTrapsAtMarker(state, rng);
    if (battle.outcome !== 'in_progress') break;

    processScheduledHitsAtMarker(state);
    if (battle.outcome !== 'in_progress') break;

    for (const f of battle.fighters) {
      if (!f.alive && f.reviveAtSlot === battle.marker) reviveFighter(state, f);
    }

    type QueueItem = { stackSeq: number; kind: 'player' | 'boss'; isBoss?: boolean; fighter?: Fighter };
    const queue: QueueItem[] = [];
    for (const f of battle.fighters) {
      if (f.alive && f.slot === battle.marker) queue.push({ stackSeq: f.stackSeq, kind: 'player', fighter: f });
    }
    if (battle.bossSlot === battle.marker) queue.push({ stackSeq: battle.bossStackSeq, kind: 'boss', isBoss: true });
    queue.sort(resolveOrderCompare);

    const visitedThisTick = new Set<number>();
    for (const entry of queue) {
      if (battle.outcome !== 'in_progress') break;

      if (entry.kind === 'boss') {
        // One call, not two: since v0.3.14 the boss's visit *is* its action — it rolls a move,
        // resolves it on the spot, then walks that move's ⏱ as cooldown. There is no separate
        // "resolve what was declared last visit" step because nothing is ever left declared.
        declareBossAction(state, rng);
        continue;
      }

      const f = entry.fighter!;
      if (!f.alive) continue;
      visitedThisTick.add(f.playerId);
      yield* resolvePlayerVisit(state, f, rng);
    }

    // The boss always resolves last within this tick's queue (player-before-boss, item 3), so a
    // Somnivar move that shifts pawns can only land someone new onto battle.marker *after* the
    // queue above was already frozen. Left unhandled, that pawn would sit exactly on a marker
    // value the clock has already finished with and never revisit — stuck for the rest of the
    // battle. Sweep for that case and give any such pawn its visit this same tick instead.
    if (battle.outcome === 'in_progress') {
      for (const f of battle.fighters) {
        if (battle.outcome !== 'in_progress') break;
        if (!f.alive || f.slot !== battle.marker || visitedThisTick.has(f.playerId)) continue;
        visitedThisTick.add(f.playerId);
        yield* resolvePlayerVisit(state, f, rng);
      }
    }
  }

  if (battle.outcome === 'boss_defeated') {
    onBattleEndScoring(state);
    battle.log.push({ t: 'BATTLE_END', outcome: 'boss_defeated', finishedBy: battle.finishedBy, expGranted: 0 });
    if (battle.finishedBy !== null) {
      state.lastShotCounts[battle.finishedBy] = (state.lastShotCounts[battle.finishedBy] ?? 0) + 1;
    }
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
  fighter.everDroppedBelowHalfThisBattle = false;
  fighter.landedMeteorThisBattle = false;
  fighter.damageDealtThisBattle = 0;
}
