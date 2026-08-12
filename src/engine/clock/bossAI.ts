// Boss declare + resolve logic — one function per boss for the resolve step since each of the 3
// bosses' 3 moves are genuinely distinct mechanics (GAME_DESIGN_v0_3_0.md §9).

import { BOSSES, rollBossMove } from '@content/bosses3';
import { pickExtreme, pickExtremeN } from './rank';
import { currentTotalScore } from './damage';
import { applyBossDamageToFighter, dealDamageToFighterFromBoss, resolveQueuedCounter } from './skills';
import type { RNG } from '../rng';
import type { BattleState, Fighter, GameState } from './types';

function aliveFighters(battle: BattleState): Fighter[] {
  return battle.fighters.filter((f) => f.alive);
}

export function declareBossAction(state: GameState, rng: RNG) {
  const battle = state.battle!;
  const die = rng.int(1, 6);
  const move = rollBossMove(battle.bossId, die);
  const landedAtSlot = battle.marker - move.time;
  battle.bossPending = { moveKey: move.key, die, declaredAtSlot: battle.marker, landedAtSlot };
  battle.bossSlot = landedAtSlot;
  battle.bossStackSeq = battle.nextStackSeq++;
  battle.log.push({ t: 'ROLL', playerId: 'boss', purpose: 'boss move', die, target: null, success: null, moveKey: move.key });
  battle.log.push({
    t: 'DECLARE',
    playerId: 'boss',
    slot: battle.marker,
    skillId: 'BossMove',
    landSlot: landedAtSlot,
    label: `${move.name.th} (${move.key})`,
    moveKey: move.key,
  });
}

/** Resolves whatever the boss declared last visit — a no-op if it was just cancelled by a trap
 *  (processTrapsAtMarker clears bossPending before this runs). */
export function resolveBossPending(state: GameState, rng: RNG) {
  const battle = state.battle!;
  const pending = battle.bossPending;
  if (!pending) return;
  // Announce the move before it lands, so the UI names it ahead of the damage numbers.
  battle.log.push({ t: 'BOSS_MOVE', bossId: battle.bossId, moveKey: pending.moveKey });
  switch (battle.bossId) {
    case 'Ragorath':
      resolveRagorath(state, pending.moveKey);
      break;
    case 'Somnivar':
      resolveSomnivar(state, pending.moveKey);
      break;
    case 'Aurelius':
      resolveAurelius(state, pending.moveKey);
      break;
  }
  battle.bossPending = null;
  battle.weakPointActive = false; // "จนกว่าบอสจะทำแอคชันถัดไป" — expires the instant the boss acts.
  void rng;
}

/** A single-target boss hit — applies damage and resolves any Counter riposte immediately, since
 *  there's only ever one target for it to matter for. */
function hit(state: GameState, target: Fighter, baseDmg: number) {
  const battle = state.battle!;
  const dmg = baseDmg + battle.rage;
  const applied = dealDamageToFighterFromBoss(state, target, dmg);
  battle.log.push({ t: 'RESOLVE_ATTACK', playerId: 'boss', skillId: 'BossMove', targetId: target.playerId, dmg: applied, wasted: false });
}

/** A multi-target boss move (an AoE, or "hit the 2 lowest") — every target takes damage first, as
 *  if simultaneously, and only once the whole wave has landed do any triggered Counters resolve.
 *  This is what stops a Counter from making the boss "already dead" partway through a wave still
 *  hitting the rest of its targets: previously each hit resolved its own Counter immediately, so a
 *  Counter on the very first target could finish the boss mid-loop while the AoE kept going, which
 *  read as the boss attacking again after it had already died. */
function hitAll(state: GameState, targets: Fighter[], baseDmg: number | ((f: Fighter) => number)) {
  const battle = state.battle!;
  const queued: { fighter: Fighter; counterDmg: number }[] = [];
  for (const f of targets) {
    const dmg = (typeof baseDmg === 'function' ? baseDmg(f) : baseDmg) + battle.rage;
    const { applied, counterDmg } = applyBossDamageToFighter(state, f, dmg);
    battle.log.push({ t: 'RESOLVE_ATTACK', playerId: 'boss', skillId: 'BossMove', targetId: f.playerId, dmg: applied, wasted: false });
    if (counterDmg > 0) queued.push({ fighter: f, counterDmg });
  }
  for (const { fighter, counterDmg } of queued) {
    resolveQueuedCounter(state, fighter, counterDmg);
  }
}

function resolveRagorath(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return;
  if (moveKey === 'A') {
    const target = pickExtreme(alive, (f) => f.slot, 'max');
    hit(state, target, 6);
  } else if (moveKey === 'B') {
    hitAll(state, alive, 4);
  } else {
    const target = pickExtreme(alive, (f) => f.hp, 'min');
    hit(state, target, 10);
  }
  battle.rage = 0; // "ทุกครั้งที่บอสรับผลแอคชันของตัวเอง Rage รีเซ็ตเป็น 0" — after adding it to this hit.
}

function resolveSomnivar(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (moveKey === 'A') {
    hitAll(state, alive, 4);
    for (const f of alive) f.slot = Math.max(0, f.slot - 1);
  } else if (moveKey === 'B') {
    const targets = pickExtremeN(alive, (f) => f.slot, 'min', 2);
    hitAll(state, targets, 11);
  } else {
    for (const f of alive) f.slot = Math.max(0, f.slot - 4);
  }
}

function resolveAurelius(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0 && moveKey !== 'B') return;
  if (moveKey === 'A') {
    const target = pickExtreme(alive, (f) => currentTotalScore(state, f.playerId), 'max');
    hit(state, target, 12);
  } else if (moveKey === 'B') {
    battle.armor += 1;
    battle.bossHp = Math.min(battle.bossHpMax, battle.bossHp + 8);
  } else {
    hitAll(state, alive, (f) => (f.hp < f.maxHp / 2 ? 14 : 7));
  }
}

export function bossArmorBaseline(bossId: string) {
  return BOSSES[bossId as keyof typeof BOSSES]?.armor ?? 0;
}
