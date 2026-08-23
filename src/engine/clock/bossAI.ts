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

import { BOSSES, rollBossMove } from '@content/bosses3';
import { pickExtreme } from './rank';
import { currentTotalScore, pushScore } from './damage';
import { scorePoints } from '@content/characters';
import { applyBossDamageToFighter, dealDamageToFighterFromBoss, resolveQueuedCounter, springTrapOnBoss } from './skills';
import { applyAilment, tickPoisonOnBossAction } from './ailments';
import type { RNG } from '../rng';
import type { BattleState, Fighter, GameState } from './types';

/** Hard stop for the reroll loops in Skyward Gore and Nightmare. Both can roll "again" forever in
 *  principle; in practice a 6 (or a dead seat) recurs with probability ≤ 1/2 per iteration, so this
 *  is unreachable in any real game — it exists so a pathological RNG can never hang the engine. */
const MAX_REROLLS = 24;

function aliveFighters(battle: BattleState): Fighter[] {
  return battle.fighters.filter((f) => f.alive);
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

/** The boss's whole turn: roll a move, resolve it here and now, then walk the pawn its ⏱ as
 *  cooldown. Nothing is left pending — there is no window in which the move is known but unresolved
 *  (v0.3.14). The name is kept for continuity with the walk loop; "declare" now means "act". */
export function declareBossAction(state: GameState, rng: RNG) {
  const battle = state.battle!;
  const die = rng.int(1, 6);
  const move = rollBossMove(battle.bossId, die);
  const nextActsAt = battle.marker - move.time;
  battle.log.push({ t: 'ROLL', playerId: 'boss', purpose: 'boss move', die, target: null, success: null, moveKey: move.key });
  battle.log.push({
    t: 'DECLARE',
    playerId: 'boss',
    slot: battle.marker,
    skillId: 'BossMove',
    landSlot: nextActsAt,
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
    applyBossMove(state, move.key, rng);
  }

  // Cooldown, applied after the blow lands — "ทำเสร็จแล้วค่อยเดินเวลา". Set unconditionally: if the
  // move killed the party or a Counter killed the boss, the walk loop stops on `outcome` anyway.
  battle.bossSlot = nextActsAt;
  battle.bossStackSeq = battle.nextStackSeq++;
}

/** Applies one boss move's actual effect. Exported for tests, which drive individual moves rather
 *  than whole battles. */
export function applyBossMove(state: GameState, moveKey: 'A' | 'B' | 'C', rng: RNG) {
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
  switch (battle.bossId) {
    case 'Ragorath':
      resolveRagorath(state, moveKey, rng);
      break;
    case 'Somnivar':
      resolveSomnivar(state, moveKey, rng);
      break;
    case 'Aurelius':
      resolveAurelius(state, moveKey);
      break;
  }
  battle.currentMoveKey = null;
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

