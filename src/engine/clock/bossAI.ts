// Boss action logic — one resolver per boss, since each of the 3 bosses' 3 moves are genuinely
// distinct mechanics (docs/GAME_DESIGN.md §9).
//
// v0.3.14 — **the boss no longer telegraphs anything.** Every move resolves the instant the boss's
// pawn is visited; the move's ⏱ is then walked as a *cooldown* rather than a wind-up. The party can
// still read *when* the boss will act next (its pawn sits on the clock like everyone else's) but
// never *what* it is about to do. This deletes the old declare→resolve gap for the boss side only:
// `BossPendingAction` is gone, nothing can be cancelled or delayed mid-flight, and the defensive
// skills that used to be timed against a known incoming move (Guard, Heal) are now bets on the
// clock instead of reads of the board. Trap! keeps its teeth by pushing the boss *pawn* back
// (@engine/clock/skills.ts) — under this model the pawn *is* the boss's next action.

import { BOSSES, rollBossMove } from '@content/bosses';
import {
  ASMODEUS_REFUSAL_HP,
  CHESS_CAPTURE_DMG,
  CHESS_CAPTURE_PUSH,
  LEVITHAR_ENVY_CAP,
  MAMMORAX_HOARD_CAP,
  PAWN_RANK_CAP,
  checkPhaseFlip,
  disgorge,
  isBlackSlot,
  targetableFighters,
} from './bossRules';
import { pickExtreme } from './rank';
import { applyDamageToFighter, currentTotalScore, healFighter, pushScore } from './damage';
import { scorePoints } from '@content/characters';
import { applyBossDamageToFighter, dealDamageToFighterFromBoss, resolveQueuedCounter, springTrapOnBoss } from './skills';
import { applyAilment, tickPoisonOnBossAction } from './ailments';
import type { RNG } from '../rng';
import type { BossMoveDef } from '@content/bosses';
import type { BattleState, Fighter, GameState } from './types';

/** Hard stop for the reroll loops in Skyward Gore and Nightmare. Both can roll "again" forever in
 *  principle; in practice a 6 (or a dead seat) recurs with probability ≤ 1/2 per iteration, so this
 *  is unreachable in any real game — it exists so a pathological RNG can never hang the engine. */
const MAX_REROLLS = 24;

/** Everyone the boss may aim at. Not simply "everyone alive": a player inside Gulvorax is off the
 *  board for targeting purposes, which is what makes his belly a place rather than a debuff. */
function aliveFighters(battle: BattleState): Fighter[] {
  return targetableFighters(battle);
}

/** Seat-index targeting, shared by Ragorath's Skyward Gore and Somnivar's Nightmare: a d6 picks a
 *  player by seat (1-4), and the two faces above that are each move's own "something else happens"
 *  branch. A face pointing at a dead seat rerolls rather than whiffing — deliberately, because the
 *  alternative rewards the party for leaving someone dead. */
function rollSeat(state: GameState, rng: RNG, purpose: string, rerollFaces: (die: number) => boolean): { fighter: Fighter | null; die: number; rerolls: number } {
  const battle = state.battle!;
  let rerolls = 0;
  for (let i = 0; i < MAX_REROLLS; i++) {
    const die = rng.int(1, 6);
    battle.log.push({ t: 'ROLL', playerId: 'boss', purpose, die, target: null, success: null });
    if (rerollFaces(die)) return { fighter: null, die, rerolls };
    const seated = battle.fighters.find((f) => f.playerId === die - 1);
    if (seated?.alive) return { fighter: seated, die, rerolls };
    rerolls += 1; // the seat is empty (dead player) — the horn swings again
  }
  const fallback = aliveFighters(battle);
  return { fighter: fallback[0] ?? null, die: 0, rerolls };
}

/** Where the boss's pawn is going, and what it ran over on the way.
 *
 *  Computed *before* the move resolves, because the chess series makes movement the weapon (§4.1):
 *  the Rook's damage lands on whoever stopped it, and its C move hits the whole lane it crossed, so
 *  a resolver has to be able to read the walk it is about to take. Resolvers may also rewrite
 *  `slot` — an uncrowned Aurelius and a cornered King both climb back up the clock after acting. */
interface BossPlan {
  slot: number;
  /** Slots crossed, nearest first. Empty for every boss whose ⏱ is just a cooldown. */
  path: number[];
  /** True when a Rook ran the whole clock without meeting anybody — it wraps to the top and acts
   *  again on the spot (§4.5). */
  wrapped: boolean;
}

/** Guards the two rules that let the boss act again inside its own action — a Rook that met nobody,
 *  and Asmodeus's ❤️ ชีวิต offer. Both are bounded in practice; this makes them bounded by
 *  construction. */
const MAX_CHAINED_BOSS_ACTIONS = 4;
let chainedBossActions = 0;

/** The boss's whole turn: roll a move, resolve it here and now, then walk the pawn its ⏱ as
 *  cooldown. Nothing is left pending — there is no window in which the move is known but unresolved
 *  (v0.3.14). The name is kept for continuity with the walk loop; "declare" now means "act". */
export function declareBossAction(state: GameState, rng: RNG) {
  const battle = state.battle!;

  // §4.7 — the chess finale's real win condition. Checked at the top of the King's visit, before he
  // acts, so the party that closed the net last tick is not made to survive one more Kingsguard for
  // it. Returns immediately: a checkmated King does not get a turn.
  if (checkCheckmate(state)) return;

  // 🕊️ An offer that has stood untaken since his last turn costs him 10 HP and this turn (§3.8).
  // Checked before anything else he could do with the turn, because the point of the weakness is
  // that the party's restraint replaces his action rather than surviving it.
  checkAsmodeusRefusal(state);

  // Something cost him the entire turn — a Knight that rode into a wall of bodies, a Gulvorax with
  // food poisoning, an offer the whole table refused. He still walks his cooldown, which is what
  // makes losing a turn worth playing for.
  if (battle.bossTurnSkipped) {
    battle.bossTurnSkipped = false;
    battle.bossSlot = Math.max(0, battle.marker - 3);
    battle.bossStackSeq = battle.nextStackSeq++;
    return;
  }

  // 📖 ความรู้ — the one rule in the game that gives back what v0.3.14 took away. When somebody
  // bought foresight, the move was rolled and shown to them at that moment; this is where the boss
  // honours it instead of rolling afresh.
  let die: number;
  if (battle.foreseenMove !== null) {
    die = battle.foreseenMove;
    battle.foreseenMove = null;
  } else {
    die = rng.int(1, 6);
  }
  const move = rollBossMove(battle.bossId, die, battle.phase);
  const plan = planBossWalk(state, move, rng);
  battle.log.push({ t: 'ROLL', playerId: 'boss', purpose: 'boss move', die, target: null, success: null, moveKey: move.key });
  battle.log.push({
    t: 'DECLARE',
    playerId: 'boss',
    slot: battle.marker,
    skillId: 'BossMove',
    landSlot: plan.slot,
    label: `${move.name.th} (${move.key})`,
    moveKey: move.key,
  });

  // The trap rolls between the move being chosen and the move happening (v0.3.15). On a hit the
  // action is cancelled outright — and the boss still pays the cooldown below, so it loses the turn
  // rather than simply re-rolling on the spot the way the pre-v0.3.9 cancel let it.
  const trapped = springTrapOnBoss(state, rng);
  if (trapped) {
    battle.log.push({ t: 'BOSS_MOVE_CANCELLED', bossId: battle.bossId, moveKey: move.key });
  } else if (battle.outcome === 'in_progress') {
    applyBossMove(state, move.key, rng, plan);
  }

  // Cooldown, applied after the blow lands — "ทำเสร็จแล้วค่อยเดินเวลา". Set unconditionally: if the
  // move killed the party or a Counter killed the boss, the walk loop stops on `outcome` anyway.
  battle.bossSlot = Math.max(0, plan.slot);
  battle.bossStackSeq = battle.nextStackSeq++;

  if (battle.outcome !== 'in_progress') return;

  // ⚔️ Capture (§4.2): a chess piece that comes to rest on an occupied slot takes that pawn. This is
  // what makes the *movement* frightening rather than only the move table, which is the whole point
  // of the series.
  resolveCapture(state);

  // A Rook that met nobody wraps to the top of the clock and fires again where it stands (§4.5).
  if (plan.wrapped && battle.outcome === 'in_progress' && chainedBossActions < MAX_CHAINED_BOSS_ACTIONS) {
    chainedBossActions += 1;
    try {
      battle.bossSlot = battle.marker;
      declareBossAction(state, rng);
    } finally {
      chainedBossActions -= 1;
    }
  }
}

/** Where the pawn goes after this move. Everything outside the chess series walks the printed ⏱
 *  straight down, exactly as it always has. */
function planBossWalk(state: GameState, move: BossMoveDef, rng: RNG): BossPlan {
  const battle = state.battle!;
  const from = battle.marker;
  const straight = (n: number): BossPlan => ({ slot: from - n, path: [], wrapped: false });

  if (BOSSES[battle.bossId].series !== 'chess') return straight(move.time);

  switch (battle.bossId) {
    case 'PawnRank':
      // Three or four, forward, forever. The most predictable pawn on the board and the one that
      // never slows down — which is the lesson the whole game rests on.
      //
      // §4.3 prints 2–3. Measured, that has the game's *tutorial* boss acting roughly twice as
      // often as any tuned boss and killing the party three times a battle (55% clear against the
      // 78% the opener is supposed to sit at). One slot slower it is still the fastest, most
      // readable piece on the board, and still the one that cannot be slowed down.
      return straight(rng.int(3, 4));
    case 'Knight':
      return knightHop(state, from, move.time);
    case 'Rook':
      return rookSail(state, from, move.time);
    case 'Bishop':
      // Always an even number of slots, so he never leaves his own colour (§4.6).
      return straight(move.time % 2 === 0 ? move.time : move.time + 1);
    case 'Queen':
      if (battle.phase === 2) return straight(move.time); // the King crawls one slot at a time
      if (move.key === 'A') return rookSail(state, from, move.time);
      if (move.key === 'B') return straight(rng.int(3, 4));
      return knightHop(state, from, move.time);
    default:
      return straight(move.time);
  }
}

/** The long leg, then one sideways toward whichever half of the clock is more crowded — so the
 *  Knight is always closing on people, and its next square is never quite readable (§4.4).
 *
 *  **Deviation from the sheet, made by measurement.** §4.4 prints the long leg as a flat 2, which on
 *  a 24-slot clock has him acting roughly every other slot — twice the rate of any tuned boss, and
 *  measured at a 5% clear rate with hard bots. The leg is the move's own ⏱ instead, so his pace is
 *  a boss's pace and the ±1 keeps the part that actually matters: you can never be sure which
 *  square he ends on.
 *
 *  A slot holding two or more pawns is the one thing it cannot leap: it stops dead on the near side
 *  and loses its next turn. That is the first reason the game has ever given anybody to stand on
 *  the same slot as a team-mate. */
function knightHop(state: GameState, from: number, leg = 2): BossPlan {
  const battle = state.battle!;
  const pivot = from - leg;
  const above = battle.fighters.filter((f) => f.alive && f.slot > pivot).length;
  const below = battle.fighters.filter((f) => f.alive && f.slot < pivot).length;
  const dest = above >= below ? pivot + 1 : pivot - 1;

  const wall = wallBetween(battle, from, dest);
  if (wall !== null) {
    battle.bossTurnSkipped = true;
    battle.log.push({ t: 'BOSS_TURN_LOST', bossId: battle.bossId, reason: 'wall' });
    return { slot: wall, path: [], wrapped: false };
  }
  return { slot: dest, path: [], wrapped: false };
}

/** The highest slot strictly between `from` and `dest` that two or more living pawns share. */
function wallBetween(battle: BattleState, from: number, dest: number): number | null {
  for (let s = from - 1; s > Math.max(dest, -1); s--) {
    const stacked = battle.fighters.filter((f) => f.alive && f.slot === s).length;
    if (stacked >= 2) return s;
  }
  return null;
}

/** The Rook sails down the lane until a player pawn stops it, halting one slot above them (§4.5).
 *  Meeting nobody at all sends it round to the top of the clock to fire again immediately — which
 *  is why standing low is not simply safer: it hands the boss extra turns.
 *
 *  **Deviation from the sheet, made by measurement.** §4.5 has it sail from the marker itself, and
 *  since somebody's pawn is nearly always sitting a slot or two below the marker, that had it
 *  acting on almost every tick — measured at a 0% clear rate. It now clears its printed ⏱ before
 *  anything can stop it, so `minimum` is the boss's floor and the party's positioning decides
 *  everything above it. The decision §4.5 is about — how long a leash to give it — survives intact;
 *  the degenerate case where the party has no choice at all does not. */
function rookSail(state: GameState, from: number, minimum = 1): BossPlan {
  const battle = state.battle!;
  const path: number[] = [];
  for (let s = from - Math.max(1, minimum); s > 0; s--) {
    path.push(s);
    if (battle.fighters.some((f) => f.alive && f.slot === s)) {
      return { slot: Math.min(from - 1, s + 1), path, wrapped: false };
    }
  }
  return { slot: 0, path, wrapped: true };
}

/** ⚔️ §4.2. A capture is not part of any move table — it is the price of letting a piece finish its
 *  walk on top of you, and it happens whatever the boss just rolled. */
function resolveCapture(state: GameState) {
  const battle = state.battle!;
  if (BOSSES[battle.bossId].series !== 'chess') return;
  // One piece, not a pile: §4.2 says the boss "กินหมากนั้น" — that piece, singular. Taking every
  // pawn sharing the slot turned a stack into a massacre, which also cut straight across the
  // Knight's wall-of-bodies weakness, the one rule in the box that asks players to stack at all.
  // Whoever is on top of the stack (highest stackSeq) is the one that gets taken.
  const caught = battle.fighters.filter((f) => f.alive && f.slot === battle.bossSlot && f.slot > 0);
  if (caught.length > 0) {
    const taken = caught.reduce((a, b) => (b.stackSeq > a.stackSeq ? b : a));
    battle.log.push({ t: 'CAPTURED', playerId: taken.playerId, dmg: CHESS_CAPTURE_DMG });
    hit(state, taken, CHESS_CAPTURE_DMG);
    if (taken.alive) taken.slot = Math.max(0, taken.slot - CHESS_CAPTURE_PUSH);
  }
}

/** 👑 §4.7 — the checkmate. The party wins outright with a pawn immediately above *and* below the
 *  King when the marker reaches him: no HP involved, which is the point, because phase 2's HP bar is
 *  set high enough that damage alone is not the answer.
 *
 *  Credited to the player standing *below* him — the seat that had to step into his path. */
function checkCheckmate(state: GameState): boolean {
  const battle = state.battle!;
  if (battle.bossId !== 'Queen' || battle.phase !== 2) return false;
  const above = battle.fighters.find((f) => f.alive && f.slot === battle.bossSlot + 1);
  const below = battle.fighters.find((f) => f.alive && f.slot === battle.bossSlot - 1);
  if (!above || !below) return false;
  battle.log.push({ t: 'CHECKMATE' });
  battle.bossHp = 0;
  battle.finishedBy = below.playerId;
  battle.outcome = 'boss_defeated';
  return true;
}

/** Applies one boss move's actual effect. Exported for tests, which drive individual moves rather
 *  than whole battles.
 *
 *  `plan` is the walk the pawn is about to take. Optional so the ~40 existing tests that drive a
 *  single move in isolation keep working untouched; the chess resolvers that genuinely need it
 *  (the Rook's lane, the Knight's landing square) fall back to a plain straight-down walk. */
export function applyBossMove(state: GameState, moveKey: 'A' | 'B' | 'C', rng: RNG, plan?: BossPlan) {
  const battle = state.battle!;
  // Announce the move before it lands, so the UI names it ahead of the damage numbers.
  battle.log.push({ t: 'BOSS_MOVE', bossId: battle.bossId, moveKey });
  // Recorded so inflictMoveAilment can look up the move's ailment without every hit site having to
  // thread it through. Cleared at the end of the move.
  battle.currentMoveKey = moveKey;
  // chrono1 (v0.4.0): settle everyone's outstanding call on this move before it resolves, so the
  // prediction is scored against what was actually rolled and cleared either way.
  settleBossMovePredictions(state, moveKey);
  // Poison is the ailment that runs on the boss's clock rather than the party's, so it ticks here —
  // before the move lands, so a poisoned fighter can be finished by the poison itself.
  tickPoisonOnBossAction(state);
  if (battle.outcome !== 'in_progress') return;
  const walk: BossPlan = plan ?? { slot: battle.marker - 3, path: [], wrapped: false };
  switch (battle.bossId) {
    case 'Ragorath':
      resolveRagorath(state, moveKey, rng);
      break;
    case 'Somnivar':
      resolveSomnivar(state, moveKey, rng);
      break;
    case 'Aurelius':
      if (battle.phase === 2) resolveAureliusUncrowned(state, moveKey, walk);
      else resolveAurelius(state, moveKey);
      break;
    case 'Levithar':
      resolveLevithar(state, moveKey);
      break;
    case 'Gulvorax':
      resolveGulvorax(state, moveKey);
      break;
    case 'Mammorax':
      resolveMammorax(state, moveKey);
      break;
    case 'Asmodeus':
      resolveAsmodeus(state, moveKey, rng);
      break;
    case 'PawnRank':
      resolvePawnRank(state, moveKey);
      break;
    case 'Knight':
      resolveKnight(state, moveKey, walk);
      break;
    case 'Rook':
      resolveRook(state, moveKey, walk);
      break;
    case 'Bishop':
      resolveBishop(state, moveKey);
      break;
    case 'Queen':
      if (battle.phase === 2) resolveKing(state, moveKey, walk);
      else resolveQueen(state, moveKey, walk);
      break;
  }
  battle.currentMoveKey = null;
  // A boss that healed itself back over the line stays uncrowned; one that just crossed it flips
  // here rather than waiting for the party's next swing.
  checkPhaseFlip(state);
}

/** A single-target boss hit — applies damage and resolves any Counter riposte immediately, since
 *  there's only ever one target for it to matter for. */
function hit(state: GameState, target: Fighter, baseDmg: number, opts: { piercesPartyMitigation?: boolean } = {}) {
  const battle = state.battle!;
  const dmg = baseDmg + battle.rage;
  const { applied, recipient } = dealDamageToFighterFromBoss(state, target, dmg, opts);
  battle.log.push({
    t: 'RESOLVE_ATTACK',
    playerId: 'boss',
    skillId: 'BossMove',
    targetId: recipient.playerId,
    dmg: applied,
    wasted: false,
    ...(recipient.playerId !== target.playerId ? { redirectedFrom: target.playerId } : {}),
  });
  // The ailment follows the damage, so Guard soaking a hit also soaks the debuff — the guardian
  // takes both, which is the same "Guard is dangerous against the right move" trade Eric already has.
  inflictMoveAilment(state, recipient, { singleTarget: true });
}

/** A multi-target boss move (an AoE, or Nightmare's two rolled shots) — every target takes damage
 *  first, as if simultaneously, and only once the whole wave has landed do any triggered Counters
 *  resolve. This is what stops a Counter from making the boss "already dead" partway through a wave
 *  still hitting the rest of its targets: previously each hit resolved its own Counter immediately,
 *  so a Counter on the very first target could finish the boss mid-loop while the AoE kept going,
 *  which read as the boss attacking again after it had already died. */
function hitAll(state: GameState, targets: Fighter[], baseDmg: number | ((f: Fighter) => number)) {
  const battle = state.battle!;
  const queued: { fighter: Fighter; counterDmg: number }[] = [];
  for (const f of targets) {
    // Damage is still *scaled* off the original target (Judgment's "below half HP takes 9" reads
    // the fighter the boss picked), then redirected — Guard changes who absorbs a hit, not how big
    // the boss decided that hit should be.
    const dmg = (typeof baseDmg === 'function' ? baseDmg(f) : baseDmg) + battle.rage;
    const { applied, counterDmg, recipient } = applyBossDamageToFighter(state, f, dmg);
    battle.log.push({
      t: 'RESOLVE_ATTACK',
      playerId: 'boss',
      skillId: 'BossMove',
      targetId: recipient.playerId,
      dmg: applied,
      wasted: false,
      ...(recipient.playerId !== f.playerId ? { redirectedFrom: f.playerId } : {}),
    });
    inflictMoveAilment(state, recipient);
    if (counterDmg > 0) queued.push({ fighter: recipient, counterDmg });
  }
  for (const { fighter, counterDmg } of queued) {
    resolveQueuedCounter(state, fighter, counterDmg);
  }
}

/** The ailment carried by the move currently resolving. Read off the move def rather than passed
 *  down, so adding an ailment to a boss move is a one-line content edit and nothing in this file
 *  has to change. */
function inflictMoveAilment(state: GameState, target: Fighter, opts: { singleTarget?: boolean } = {}) {
  const battle = state.battle!;
  if (battle.currentMoveKey === null) return;
  const move = BOSSES[battle.bossId].moves.find((m) => m.key === battle.currentMoveKey);
  if (!move?.inflicts) return;
  applyAilment(state, target, move.inflicts, opts);
}

/** chrono1: resolve every outstanding call on the boss's move. Cleared whether right or wrong, so
 *  a prediction is a commitment for exactly one boss action rather than a standing bet. */
function settleBossMovePredictions(state: GameState, moveKey: 'A' | 'B' | 'C') {
  for (const f of state.battle!.fighters) {
    if (f.predictedBossMove === null) continue;
    const wasRight = f.predictedBossMove === moveKey;
    f.predictedBossMove = null;
    if (wasRight && f.charId === 'Chrono') {
      state.battle!.log.push({ t: 'PREDICTION_HIT', playerId: f.playerId, moveKey });
      pushScore(state, { playerId: f.playerId, conditionId: 'chrono1', points: scorePoints('chrono1') });
    }
  }
}

function resolveRagorath(state: GameState, moveKey: 'A' | 'B' | 'C', rng: RNG) {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return;
  if (moveKey === 'A') {
    // Skyward Gore (v0.3.14): the horn goes where the dice say, not where the board says. 1-4 gores
    // that seat, 5 catches everyone, 6 means he winds up again — +1 Rage and roll afresh, so the
    // face that "does nothing" is the one that makes the eventual hit hurt most.
    for (let i = 0; i < MAX_REROLLS; i++) {
      const { fighter, die } = rollSeat(state, rng, 'skyward gore', (d) => d >= 5);
      if (die === 6) {
        battle.rage += 1;
        continue;
      }
      if (die === 5) {
        hitAll(state, aliveFighters(battle), 6);
        break;
      }
      if (!fighter) break;
      hit(state, fighter, 6);
      break;
    }
  } else if (moveKey === 'B') {
    hitAll(state, alive, 4);
  } else {
    // Frenzy (v0.3.14): he goes for whoever has hurt him most this battle, not whoever is weakest.
    // Inverts the move's whole role — it used to execute the party's casualty, it now punishes
    // their best damage dealer, which is a decision the party can actually play around.
    hit(state, pickExtreme(alive, (f) => f.damageDealtThisBattle, 'max'), 10);
  }
  battle.rage = 0; // "ทุกครั้งที่บอสรับผลแอคชันของตัวเอง Rage รีเซ็ตเป็น 0" — after adding it to this hit.
}

function resolveSomnivar(state: GameState, moveKey: 'A' | 'B' | 'C', rng: RNG) {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (moveKey === 'A') {
    hitAll(state, alive, 4);
    // The slot push hits everyone alive, not only whoever absorbed the damage — Guard redirects
    // hits, never the clock manipulation the move also carries.
    for (const f of aliveFighters(battle)) f.slot = Math.max(0, f.slot - 1);
  } else if (moveKey === 'B') {
    // Nightmare (v0.3.14): two rolled shots that can land on the same person, and a 5-6 is not a
    // miss — it rerolls *and* drags whoever eventually gets picked one slot further down the clock
    // per reroll. The dream keeps looking for you, and finding you later costs you time as well
    // as HP. Both shots are chosen and applied as one wave so a Counter cannot kill the boss
    // between them.
    const shots: { fighter: Fighter; pushes: number }[] = [];
    for (let shot = 0; shot < 2; shot++) {
      const { fighter, rerolls } = rollSeat(state, rng, 'nightmare target', () => false);
      if (fighter) shots.push({ fighter, pushes: rerolls });
    }
    hitAll(state, shots.map((s) => s.fighter), 7);
    for (const { fighter, pushes } of shots) {
      if (pushes > 0 && fighter.alive) fighter.slot = Math.max(0, fighter.slot - pushes);
    }
  } else {
    for (const f of alive) f.slot = Math.max(0, f.slot - 4);
  }
}

function resolveAurelius(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return;
  if (moveKey === 'A') {
    // Procession pierces Blessing (v0.3.11) and is the catch-up mechanic — it hunts whoever is
    // winning on points. v0.3.14 traded size for frequency: 12 at ⏱5 → 9 at ⏱4, so the leader is
    // hunted more often rather than harder.
    hit(state, pickExtreme(alive, (f) => currentTotalScore(state, f.playerId), 'max'), 9, { piercesPartyMitigation: true });
  } else if (moveKey === 'B') {
    battle.armor += 1;
    battle.bossHp = Math.min(battle.bossHpMax, battle.bossHp + 8);
  } else {
    hitAll(state, alive, (f) => (f.hp < f.maxHp / 2 ? 9 : 4));
  }
}


// ═══════════════════════════════ ปีศาจแห่งบาป 7 ═══════════════════════════════
//
// The series has no shared token and nothing to learn before the first sheet is read
// (docs/BOSS_SERIES_DESIGN.md §3.2). What ties it together is a principle: each sin taxes a
// different resource, and aims at whoever has spent the most of it. Every superlative below is the
// same `pickExtreme` the game already used for Frenzy and Procession — only the measuring function
// differs, which is why the whole series costs nothing structural.

/** §3.4 — Levithar eats the party's cooperation. Its envy meter counts every buff a player takes
 *  from somebody else (see onBuffReceived), so the one thing the game has spent five versions
 *  teaching — buff each other, slot ② is the heart of the kit — is here, and only here, taxed. */
function resolveLevithar(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return;

  if (moveKey === 'A') {
    hitAll(state, alive, 3 + Math.floor(battle.envy / 2));
    return;
  }
  if (moveKey === 'B') {
    // Dispossess takes back what the party gave each other — the party buff, every personal shield,
    // and the Guard link — then hits whoever has taken the most of it. Because it hunts the
    // *receiver*, a buff stops being a gift and becomes an offer the target may refuse.
    battle.partyBuff = null;
    battle.guard = null;
    for (const f of battle.fighters) f.shield = null;
    hit(state, pickExtreme(alive, (f) => f.buffsReceivedThisBattle, 'max'), 7);
    battle.envy += 2;
    battle.log.push({ t: 'ENVY_CHANGED', amount: 2, total: battle.envy });
    return;
  }
  // Overflow spends the whole meter at once and empties it: the party's generosity, handed back as
  // one blow. Capped so a long fight cannot turn it into an unanswerable wipe.
  const dmg = Math.min(battle.envy, LEVITHAR_ENVY_CAP);
  hitAll(state, alive, dmg);
  const spent = battle.envy;
  battle.envy = 0;
  battle.log.push({ t: 'ENVY_CHANGED', amount: -spent, total: 0 });
}

/** §3.6 — Gulvorax removes a player from the board rather than damaging them, and picks his victim
 *  by who has been *healed* most. The party's cleric chooses his meal without meaning to. */
function resolveGulvorax(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  if (battle.swallowedId !== null) battle.swallowedTurns += 1;
  const swallowed = battle.fighters.find((f) => f.playerId === battle.swallowedId) ?? null;

  if (moveKey === 'A') {
    if (swallowed === null) {
      const candidates = aliveFighters(battle);
      if (candidates.length === 0) return;
      // Ties go to whoever is healthiest — he is eating the best-fed one, not the weakest.
      const prey = pickExtreme(candidates, (f) => f.healReceivedThisBattle * 100 + f.hp, 'max');
      battle.swallowedId = prey.playerId;
      battle.swallowedTurns = 0;
      battle.swallowDamage = 0;
      battle.log.push({ t: 'SWALLOWED', playerId: prey.playerId });
      return;
    }
    hitAll(state, aliveFighters(battle), 5 + battle.swallowedTurns);
    return;
  }

  if (moveKey === 'B') {
    if (swallowed && swallowed.alive) {
      // Digesting is the one damage in the game that reaches into the belly. It heals him for the
      // same amount, which is what makes leaving a team-mate in there cost the party twice.
      const dealt = applyDamageToFighter(state, swallowed, 6);
      battle.bossHp = Math.min(battle.bossHpMax, battle.bossHp + dealt);
      battle.log.push({ t: 'RESOLVE_ATTACK', playerId: 'boss', skillId: 'BossMove', targetId: swallowed.playerId, dmg: dealt, wasted: false });
      inflictMoveAilment(state, swallowed, { singleTarget: true });
      return;
    }
    const alive = aliveFighters(battle);
    if (alive.length === 0) return;
    hit(state, pickExtreme(alive, (f) => f.hp, 'max'), 8);
    return;
  }

  // Regurgitate: the victim is spat out at the very bottom of the clock, which costs them nearly
  // the whole rest of the battle — the real damage of this boss has always been time, not HP.
  disgorge(state, 0);
  hitAll(state, aliveFighters(battle), 9);
}

/** §3.7 — Mammorax's hoard is armor that can be stolen, and the gold prised off it becomes real
 *  gems for whoever landed the blow. His defence is the party's payday, which is why the fight is
 *  about who gets to throw the big punch rather than about throwing enough of them. */
function resolveMammorax(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return;
  // Every action adds to the pile, so a long fight is a losing fight.
  battle.hoard = Math.min(MAMMORAX_HOARD_CAP, battle.hoard + 1);

  if (moveKey === 'A') {
    // The tithe hunts whoever is carrying the most, ties broken by who has robbed him most — the
    // two ways a player can be rich in this fight, in the order he cares about them.
    const target = pickExtreme(
      alive,
      (f) => (state.progress[f.playerId]?.items.length ?? 0) * 100 + f.goldRobbedThisBattle,
      'max'
    );
    const carried = state.progress[target.playerId]?.items ?? [];
    if (carried.length > 0) {
      hit(state, target, 8);
      carried.shift();
    } else {
      // Nothing to take, so he takes it out of them instead. The player who spent everything is the
      // one who gets hit hardest, which is the sin stated as a rule.
      hit(state, target, 11);
    }
    return;
  }
  if (moveKey === 'B') {
    battle.hoard = Math.min(MAMMORAX_HOARD_CAP, battle.hoard + 3);
    battle.bossHp = Math.min(battle.bossHpMax, battle.bossHp + Math.floor(battle.hoard / 2));
    return;
  }
  hitAll(state, alive, 4);
  // Midas' Curse claws the stolen gold back — the only move in the game that takes away a reward
  // already earned, which is exactly what greed is.
  for (const f of battle.fighters) {
    if (f.goldRobbedThisBattle > 0 && battle.hoard < MAMMORAX_HOARD_CAP) {
      f.goldRobbedThisBattle -= 1;
      battle.hoard += 1;
    }
  }
}

/** §3.8 — the six temptations. Every one reads "I gain, the party loses", and everybody at the
 *  table can see who took it. This is the game's own premise — all four must kill the boss, only
 *  one can win — turned into a button. */
export const TEMPTATIONS = [
  { die: 1, key: 'gold', th: '💰 ทองคำ', en: '💰 Gold' },
  { die: 2, key: 'haste', th: '🏃 ความเร็ว', en: '🏃 Speed' },
  { die: 3, key: 'power', th: '💪 พลัง', en: '💪 Power' },
  { die: 4, key: 'fame', th: '👑 ชื่อเสียง', en: '👑 Fame' },
  { die: 5, key: 'life', th: '❤️ ชีวิต', en: '❤️ Life' },
  { die: 6, key: 'knowledge', th: '📖 ความรู้', en: '📖 Knowledge' },
] as const;

function resolveAsmodeus(state: GameState, moveKey: 'A' | 'B' | 'C', rng: RNG) {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return;

  if (moveKey === 'A') {
    // Whisper punishes exactly the people who held out — and hits nobody at all if somebody caved.
    // The party can always make this move harmless; they just have to let one of themselves profit.
    const refusers = alive.filter((f) => f.refusedStandingOffer);
    if (refusers.length > 0) hitAll(state, refusers, 6);
  } else if (moveKey === 'B') {
    const victim = pickExtreme(alive, (f) => f.offersAcceptedThisBattle, 'max');
    const before = victim.hp;
    hit(state, victim, 9);
    battle.bossHp = Math.min(battle.bossHpMax, battle.bossHp + (before - victim.hp));
    // And it pays them two points for it. Being his favourite is not purely a punishment, which is
    // what stops the party from simply agreeing that nobody accepts anything.
    pushScore(state, { playerId: victim.playerId, conditionId: 'asmodeusKiss', points: 2 });
  } else {
    const thrall = pickExtreme(alive, (f) => f.offersAcceptedThisBattle, 'max');
    thrall.enthralledTurns = 1;
    hitAll(state, alive.filter((f) => f.playerId !== thrall.playerId), 4);
  }

  layTemptation(state, rng);
}

/** Lays the next temptation face up and marks everyone still alive as having refused the last one.
 *  Called at the end of his action so the offer is on the table for the visits that follow. */
function layTemptation(state: GameState, rng: RNG) {
  const battle = state.battle!;
  const die = rng.int(1, 6);
  battle.offer = { die, takenBy: null };
  for (const f of battle.fighters) f.refusedStandingOffer = false;
  battle.log.push({ t: 'OFFER_MADE', die });
}

/** 🕊️ §3.8's weakness, checked at the top of his turn: an offer nobody took costs him 10 HP and the
 *  whole turn. The easiest weakness in the box to read and the hardest to use, because it asks four
 *  players competing for a single win to all decline free value at once. */
export function checkAsmodeusRefusal(state: GameState): void {
  const battle = state.battle!;
  if (battle.bossId !== 'Asmodeus' || battle.offer === null) return;
  if (battle.offer.takenBy !== null) return;
  battle.offer = null;
  battle.bossTurnSkipped = true;
  battle.bossHp = Math.max(0, battle.bossHp - ASMODEUS_REFUSAL_HP);
  battle.log.push({ t: 'BOSS_TURN_LOST', bossId: battle.bossId, reason: 'refused' });
  if (battle.bossHp <= 0 && battle.outcome === 'in_progress') battle.outcome = 'boss_defeated';
}

/** Somebody took the standing temptation. Resolved at the top of their declare (see walk.ts) so the
 *  gems, the haste or the power it hands them can be spent on the very turn they took it. */
export function acceptTemptation(state: GameState, taker: Fighter, rng: RNG): void {
  const battle = state.battle!;
  const offer = battle.offer;
  if (!offer || offer.takenBy !== null) return;
  offer.takenBy = taker.playerId;
  taker.offersAcceptedThisBattle += 1;
  taker.refusedStandingOffer = false;
  battle.log.push({ t: 'OFFER_TAKEN', playerId: taker.playerId, die: offer.die });

  const others = aliveFighters(battle).filter((f) => f.playerId !== taker.playerId);
  switch (offer.die) {
    case 1: // 💰 ทองคำ — gems now, and he heals for it
      if (state.progress[taker.playerId]) state.progress[taker.playerId].gems += 3;
      battle.bossHp = Math.min(battle.bossHpMax, battle.bossHp + 8);
      break;
    case 2: // 🏃 ความเร็ว — your pawn jumps forward, everyone else's slides back
      taker.slot = Math.min(battle.marker, taker.slot + 4);
      taker.stackSeq = battle.nextStackSeq++;
      for (const f of others) f.slot = Math.max(0, f.slot - 1);
      break;
    case 3: // 💪 พลัง — a bigger next swing, paid for in blood on the spot
      taker.itemAtkBonus += 8;
      applyDamageToFighter(state, taker, 6, { selfInflicted: true });
      break;
    case 4: // 👑 ชื่อเสียง — points, and his attention. The cost reuses his own measure, so it needs
      // no extra state: fame simply makes you look like the greediest player at the table.
      pushScore(state, { playerId: taker.playerId, conditionId: 'asmodeusFame', points: 3 });
      taker.offersAcceptedThisBattle += 2;
      break;
    case 5: // ❤️ ชีวิต — full health, and he moves again immediately
      healFighter(taker, taker.maxHp);
      if (chainedBossActions < MAX_CHAINED_BOSS_ACTIONS && battle.outcome === 'in_progress') {
        chainedBossActions += 1;
        try {
          declareBossAction(state, rng);
        } finally {
          chainedBossActions -= 1;
        }
      }
      break;
    case 6: // 📖 ความรู้ — the telegraph, back for one move only, bought with an ally's HP
      battle.foreseenMove = rng.int(1, 6);
      if (others.length > 0) {
        applyDamageToFighter(state, pickExtreme(others, (f) => f.hp, 'min'), 5);
      }
      break;
  }
}

/** §3.9 phase 2. The armor is gone, so the puzzle is gone with it: this is a straight race, and the
 *  two characters who spent the whole fight unable to dent him are suddenly the important ones. */
function resolveAureliusUncrowned(state: GameState, moveKey: 'A' | 'B' | 'C', plan: BossPlan) {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return;
  if (moveKey === 'A') {
    // Through everything — Blessing, Guard, shields, items. Nothing talks a fallen king down.
    const leader = pickExtreme(alive, (f) => currentTotalScore(state, f.playerId), 'max');
    const dealt = applyDamageToFighter(state, leader, 12, { selfInflicted: true });
    battle.log.push({ t: 'RESOLVE_ATTACK', playerId: 'boss', skillId: 'BossMove', targetId: leader.playerId, dmg: dealt, wasted: false });
  } else if (moveKey === 'B') {
    // No more healing. He buys time instead — his pawn climbs back toward the marker, so he acts
    // sooner rather than surviving longer.
    plan.slot = Math.min(battle.marker - 1, plan.slot + 2);
  } else {
    hitAll(state, alive, 8);
  }
}

// ═══════════════════════════════ ตัวหมากรุก ═══════════════════════════════
//
// §4.1 — chess pieces are remembered for how they *move*, and this game already has a board every
// pawn moves on. So in this series the movement is the weapon: a piece's ⏱ is not a printed
// cooldown but the consequence of a rule, and where the party stands is an input to it.

/** §4.3 — forward only, forever, getting bigger. Ranks are the whole boss: a number that goes up
 *  every turn and can only be brought down by shoving him backwards. */
function resolvePawnRank(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return;
  const rank = battle.pawnRank;
  if (moveKey === 'A') {
    // The pike goes to whoever has fallen furthest down the clock — a pawn rank does not choose its
    // target, it simply arrives at the person in front of it.
    hit(state, pickExtreme(alive, (f) => f.slot, 'min'), 4 + rank);
    return;
  }
  if (moveKey === 'B') {
    hitAll(state, alive, 2 + rank);
    battle.pawnRank = Math.min(PAWN_RANK_CAP, battle.pawnRank + 1);
    return;
  }
  hitAll(state, alive, 5 + rank);
  battle.pawnRank = Math.min(PAWN_RANK_CAP, battle.pawnRank + 2);
}

/** §4.4 — the Knight closes on whichever half of the clock is more crowded, and cannot be trapped,
 *  only walled. Its A move is the counterweight: standing together is what stops it, and standing
 *  together is what its charge eats. */
function resolveKnight(state: GameState, moveKey: 'A' | 'B' | 'C', plan: BossPlan) {
  const battle = state.battle!;
  if (moveKey === 'A') {
    const near = aliveFighters(battle).filter((f) => Math.abs(f.slot - battle.bossSlot) <= 2);
    if (near.length > 0) hitAll(state, near, 6);
    return;
  }
  const leaps = moveKey === 'B' ? 2 : 3;
  const dmg = moveKey === 'B' ? 5 : 4;
  for (let i = 0; i < leaps && battle.outcome === 'in_progress'; i++) {
    const hop = knightHop(state, plan.slot + 1);
    plan.slot = hop.slot;
    const struck = aliveFighters(battle).filter((f) => Math.abs(f.slot - plan.slot) <= 1);
    if (struck.length > 0) hitAll(state, struck, dmg);
    if (battle.bossTurnSkipped) break; // rode into a wall of bodies mid-combination
  }
}

/** §4.5 — the prettiest rule in the series: the Rook's ⏱ is not printed anywhere. It sails until a
 *  player pawn stops it, so the party decides how often the boss acts by deciding where to stand. */
function resolveRook(state: GameState, moveKey: 'A' | 'B' | 'C', plan: BossPlan) {
  const battle = state.battle!;
  const blocker = battle.fighters.find((f) => f.alive && f.slot === plan.slot - 1) ?? null;
  if (moveKey === 'C') {
    // It runs the whole lane down rather than stopping at one person, which is what punishes a
    // party that answered the last boss by bunching up.
    const inLane = aliveFighters(battle).filter((f) => plan.path.includes(f.slot));
    if (inLane.length > 0) hitAll(state, inLane, 8);
    return;
  }
  if (moveKey === 'B') battle.armor += 2;
  if (blocker) hit(state, blocker, moveKey === 'A' ? 9 : 4);
}

/** §4.6 — half the board is safe and useless, the other half is where the fight is, and which half
 *  is which changes on his B move. Because the colour a player ends on is decided by the ⏱ of the
 *  card they choose, every skill in the game gains a second meaning for one battle. */
function resolveBishop(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  if (moveKey === 'B') {
    battle.colorFlipped = !battle.colorFlipped;
    battle.armor += 1;
    return;
  }
  const onBlack = aliveFighters(battle).filter((f) => isBlackSlot(battle, f.slot));
  if (moveKey === 'A') {
    if (onBlack.length > 0) hitAll(state, onBlack, 9);
    return;
  }
  // The eternal diagonal lands somewhere new and catches everyone sharing its colour — which after
  // a leap of twelve slots is the same colour it left, because twelve is even.
  const sharing = aliveFighters(battle).filter((f) => isBlackSlot(battle, f.slot) === isBlackSlot(battle, battle.bossSlot));
  if (sharing.length > 0) hitAll(state, sharing, 6);
}

/** §4.7 phase 1 — she moves like every piece the party has already fought, so the finale is the
 *  four previous lessons examined at once. */
function resolveQueen(state: GameState, moveKey: 'A' | 'B' | 'C', plan: BossPlan) {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return;

  if (moveKey === 'A') {
    const blocker = battle.fighters.find((f) => f.alive && f.slot === plan.slot - 1) ?? null;
    if (blocker) hit(state, blocker, 10, { piercesPartyMitigation: true });
    return;
  }
  if (moveKey === 'B') {
    // Summoned pawns are tokens on slots, not a second boss pawn — the same primitive Kit's trap
    // already is, pointed the other way.
    for (const offset of [2, 4]) {
      const slot = battle.marker - offset;
      if (slot > 0) battle.bossPawns.push({ slot, dmg: 5, ownerId: -1 });
    }
    hitAll(state, alive, 3);
    return;
  }
  for (let i = 0; i < 2 && battle.outcome === 'in_progress'; i++) {
    const hop = knightHop(state, plan.slot + 1);
    plan.slot = hop.slot;
    const struck = aliveFighters(battle).filter((f) => Math.abs(f.slot - plan.slot) <= 1);
    if (struck.length > 0) hitAll(state, struck, 8);
  }
}

/** §4.7 phase 2 — the King is slow, weak and nearly unkillable by damage, and the win condition has
 *  changed to putting a pawn on both sides of him. Every move he has punishes exactly that.
 *
 *  One adaptation from the sheet: "ผลักทุกคนออกห่างจากราชา 2 ช่อง" is implemented as shoving anyone
 *  adjacent 3 slots *down*, because this clock only ever runs one way — a pawn pushed above the
 *  marker would never be visited again, which is a far worse punishment than the card intends. */
function resolveKing(state: GameState, moveKey: 'A' | 'B' | 'C', plan: BossPlan) {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return;
  const adjacent = alive.filter((f) => Math.abs(f.slot - battle.bossSlot) <= 1);

  if (moveKey === 'A') {
    if (adjacent.length > 0) hitAll(state, adjacent, 6);
    return;
  }
  if (moveKey === 'B') {
    plan.slot = Math.min(battle.marker - 1, plan.slot + 2);
    return;
  }
  hitAll(state, alive, 6);
  for (const f of alive) {
    if (Math.abs(f.slot - battle.bossSlot) <= 1) f.slot = Math.max(0, f.slot - 3);
  }
}
