// The clock walk — the whole game's core loop. See docs/10-v0.3.0-rulings.md and
// GAME_DESIGN_v0_3_0.md §4 for the rules this implements.

import { CHARACTERS } from '@content/characters';
import type { RNG } from '../rng';
import { declareSkill, expireTimedEffectsAtMarker, legalTrapSlots, processScheduledHitsAtMarker, processTrapsAtMarker, resolveFighterPending, resolveSwallowedDeclare } from './skills';
import { expireAilmentsAtMarker, tickOnOwnVisit } from './ailments';
import { pushScore } from './damage';
import { SHADOW_MAX, scorePoints } from '@content/characters';
import { acceptTemptation, declareBossAction } from './bossAI';
import { processBossPawnsAtMarker, tickBossSlotRules } from './bossRules';
import { reviveFighter } from './damage';
import { onBattleEndScoring } from './scoring';
import { fractureGemsAreSpendable, owedFractures, settleUnclaimedFractures } from './fracture';
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
  // v0.4.0 — chrono2 asks whether the ally Chrono hastened actually spent the visit he bought
  // them. Read here, before the pending resolves, and cleared either way so the credit only ever
  // applies to that one visit.
  const hastedBy = f.hastedByPlayerId;
  f.hastedByPlayerId = null;
  const damageBeforeVisit = f.damageDealtThisBattle;

  resolveFighterPending(state, f, rng);
  if (battle.outcome !== 'in_progress') return;
  if (!f.alive) return;

  // A player who has had a whole visit with an offer on the table and did not take it has refused
  // it — that is what Whisper reads. Latched here, at the start of the visit, so accepting below
  // clears it again in the same breath.
  if (battle.offer && battle.offer.takenBy === null) f.refusedStandingOffer = true;

  // Kage's Shadowless: a visit reached without the boss having touched him since the last one.
  // `shadow` is zeroed by any boss hit (see applyBossDamageToFighter), so surviving untouched is
  // the entire condition — nothing else needs tracking.
  if (f.charId === 'Kage') f.shadow = Math.min(SHADOW_MAX, f.shadow + 1);

  const options = buildDeclareOptions(state, f);
  const choice = yield { kind: 'DECLARE_ACTION', playerId: f.playerId, options };
  if (choice.kind !== 'DECLARE_ACTION') throw new Error(`expected DECLARE_ACTION for player ${f.playerId}`);

  // Inside Gulvorax the card still gets picked, but only its ⏱ matters: the fighter flails, and
  // the boss takes damage equal to it. Everything else the skill would have done — the buff, the
  // heal, the trap, the scoring hook — does not happen, which is the real cost of being eaten.
  if (battle.swallowedId === f.playerId) {
    resolveSwallowedDeclare(state, f, choice);
  } else {
    declareSkill(state, f, choice, rng);
  }

  // Asmodeus's temptation settles *after* the declare, not before it.
  //
  // §3.8 has it resolve first, on the reasoning that two of the offers hand over resources the same
  // turn might want to spend. In the engine that ordering is unsound and the printed cards do not
  // actually need it: taking an offer can kill an ally (📖 ความรู้ hits the lowest-HP player, ❤️
  // ชีวิต hands the boss a whole extra action), and the choice was built against the board as it
  // stood *before* any of that — so a Guard declared on a living ally could find them dead by the
  // time it was validated, which crashed the run outright. Settling afterwards is also closer to
  // what the cards say: 💪 พลัง reads "your **next** skill +8", and 💰 ทองคำ's gems are camp
  // currency that was never spendable mid-battle in the first place.
  if (choice.acceptOffer && options.offer) {
    acceptTemptation(state, f, rng);
  }

  if (hastedBy !== null && f.damageDealtThisBattle > damageBeforeVisit) {
    pushScore(state, { playerId: hastedBy, conditionId: 'chrono2', points: scorePoints('chrono2') });
  }
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
    // Asmodeus's standing temptation, if there is one and nobody has taken it yet. Offered on the
    // declare rather than as a decision of its own, exactly like the fracture claim — the choice
    // rides a turn the player is already taking (§3.8).
    offer: battle.offer && battle.offer.takenBy === null ? { die: battle.offer.die } : null,
    swallowed: battle.swallowedId === fighter.playerId,
    fractureClaims: owedFractures(state, fighter.playerId),
    fractureGemsUseful: fractureGemsAreSpendable(state),
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
      // The clock running out is a hard `return`, so this exit needs its own settle — the one
      // after the loop below cannot see it. Both calls are idempotent.
      settleUnclaimedFractures(state);
      battle.log.push({ t: 'BATTLE_END', outcome: 'clock_ran_out', finishedBy: null, expGranted: 0 });
      return;
    }
    battle.log.push({ t: 'MARKER_TICK', marker: battle.marker });

    // Fixed-duration buffs expire before traps, scheduled hits, player visits or the boss can use
    // them at this slot. Blessing declared at N therefore covers exactly N→N-4, not Luna's return.
    expireTimedEffectsAtMarker(state);
    // Same slot, same reasoning as the buffs above: an ailment declared to last 4 slots covers
    // exactly N→N-4. Doom *fires* here rather than lapsing — see expireAilmentsAtMarker.
    expireAilmentsAtMarker(state);
    if (battle.outcome !== 'in_progress') break;

    // Levithar's solitude counter, and nothing else — one call rather than a per-boss branch here,
    // so the walk loop stays a description of the clock rather than of the roster.
    tickBossSlotRules(state);
    if (battle.outcome !== 'in_progress') break;

    processTrapsAtMarker(state);
    if (battle.outcome !== 'in_progress') break;

    // The Queen's summoned pawns bite whoever stops on their slot — the same primitive as a trap,
    // pointed at the party instead of at the boss, so it resolves in the same place.
    processBossPawnsAtMarker(state);
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
    let bossActedThisTick = false;
    for (const entry of queue) {
      if (battle.outcome !== 'in_progress') break;

      if (entry.kind === 'boss') {
        bossActedThisTick = true;
        // One call, not two: since v0.3.14 the boss's visit *is* its action — it rolls a move,
        // resolves it on the spot, then walks that move's ⏱ as cooldown. There is no separate
        // "resolve what was declared last visit" step because nothing is ever left declared.
        declareBossAction(state, rng);
        continue;
      }

      const f = entry.fighter!;
      if (!f.alive) continue;
      visitedThisTick.add(f.playerId);
      // Burn and bleed bite on the victim's own visit, before they get to act — being visited more
      // often is the price of those two, which is exactly the inverse of poison.
      tickOnOwnVisit(state, f);
      if (!f.alive) continue;
      if (battle.outcome !== 'in_progress') break;
      yield* resolvePlayerVisit(state, f, rng);
    }

    // A two-phase finale that flipped mid-tick put its pawn on the marker after the queue above was
    // frozen (§1.1: "หมากบอสกระโดดขึ้นไปที่ช่องมาร์กเกอร์ทันที → ได้ลงมือทันที 1 ครั้ง"). Give it that
    // action here rather than at the next tick, which is what makes the flip land as a shock.
    if (battle.outcome === 'in_progress' && !bossActedThisTick && battle.bossSlot === battle.marker) {
      bossActedThisTick = true;
      declareBossAction(state, rng);
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

  // A bounty crossed on the killing blow — or by a trap on the last tick — never gets a visit to
  // be claimed on. Rather than losing it, it settles as the item (see settleUnclaimedFractures).
  settleUnclaimedFractures(state);

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
  // v0.4.0. Souls and sand deliberately reset per battle like mana does — none of the new
  // resources bank across boss fights, so a long first battle can't front-load the third one.
  fighter.sand = 0;
  fighter.shadow = 0;
  fighter.souls = 0;
  fighter.soulsScored = 0;
  fighter.stealthUntilSlot = null;
  fighter.stealthStrikeBonus = 0;
  fighter.everHitByBossThisBattle = false;
  fighter.predictedBossMove = null;
  fighter.hastedByPlayerId = null;
  fighter.ailments = [];
  fighter.buffsReceivedThisBattle = 0;
  fighter.healReceivedThisBattle = 0;
  fighter.goldRobbedThisBattle = 0;
  fighter.offersAcceptedThisBattle = 0;
  fighter.refusedStandingOffer = false;
  fighter.enthralledTurns = 0;
}
