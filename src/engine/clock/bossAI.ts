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

/** Who a given boss move would hit, given the board right now. Every resolver below reads its
 *  targets through this, and so does the bots' Guard heuristic (`src/bots/heuristics.ts`) — the
 *  boss's move is rolled and public the moment it declares (§4.4), so "who is about to get hit"
 *  is information a player at the table genuinely has. Kept as one function on purpose: the
 *  Set Trap slot bug (docs/BALANCE_NOTES.md, 2026-08-11) came from exactly this kind of rule
 *  being computed once for the engine and again for whoever consumes it.
 *
 *  Returns [] for moves that deal no damage at all (Golden Throne, Eternal Slumber). */
export function bossMoveTargets(state: GameState, moveKey: 'A' | 'B' | 'C'): Fighter[] {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  if (alive.length === 0) return [];
  switch (battle.bossId) {
    case 'Ragorath':
      if (moveKey === 'A') return [pickExtreme(alive, (f) => f.slot, 'max')];
      if (moveKey === 'B') return alive;
      return [pickExtreme(alive, (f) => f.hp, 'min')];
    case 'Somnivar':
      if (moveKey === 'A') return alive;
      if (moveKey === 'B') return pickExtremeN(alive, (f) => f.slot, 'min', 2);
      return [];
    case 'Aurelius':
      if (moveKey === 'A') return [pickExtreme(alive, (f) => currentTotalScore(state, f.playerId), 'max')];
      if (moveKey === 'B') return [];
      return alive;
  }
}

export function declareBossAction(state: GameState, rng: RNG) {
  const battle = state.battle!;
  const die = rng.int(1, 6);
  const move = rollBossMove(battle.bossId, die);
  const landedAtSlot = battle.marker - move.time;
  // The pawn walks the move's full ⏱ either way — `immediate` changes when the effect lands, not
  // how long the boss is then busy for. Same contract as the heroes' ⚡ skills.
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

  if (move.immediate) {
    // Resolved here and now, and deliberately left with no bossPending afterwards: there is nothing
    // queued to read, cancel or delay. A Trap! springing later therefore finds nothing to postpone,
    // which is correct — the blow already landed.
    applyBossMove(state, move.key);
    return;
  }
  battle.bossPending = { moveKey: move.key, die, declaredAtSlot: battle.marker, landedAtSlot };
}

/** Applies one boss move's actual effect. Shared by the normal resolve-later path and the
 *  `immediate` path in declareBossAction, so both run the identical move logic. */
function applyBossMove(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  // Announce the move before it lands, so the UI names it ahead of the damage numbers.
  battle.log.push({ t: 'BOSS_MOVE', bossId: battle.bossId, moveKey });
  switch (battle.bossId) {
    case 'Ragorath':
      resolveRagorath(state, moveKey);
      break;
    case 'Somnivar':
      resolveSomnivar(state, moveKey);
      break;
    case 'Aurelius':
      resolveAurelius(state, moveKey);
      break;
  }
  battle.weakPointActive = false; // "จนกว่าบอสจะทำแอคชันถัดไป" — expires the instant the boss acts.
}

/** Resolves whatever the boss declared last visit — a no-op if it was just cancelled by a trap, or
 *  if the move was `immediate` and already resolved at declare (which leaves no pending at all). */
export function resolveBossPending(state: GameState, rng: RNG) {
  const battle = state.battle!;
  const pending = battle.bossPending;
  if (!pending) return;
  applyBossMove(state, pending.moveKey);
  battle.bossPending = null;
  void rng;
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
    // Damage is still *scaled* off the original target (Judgement's "below half HP takes 14" reads
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
    if (counterDmg > 0) queued.push({ fighter: recipient, counterDmg });
  }
  for (const { fighter, counterDmg } of queued) {
    resolveQueuedCounter(state, fighter, counterDmg);
  }
}

function resolveRagorath(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  const targets = bossMoveTargets(state, moveKey);
  if (targets.length === 0) return;
  if (moveKey === 'A') {
    hit(state, targets[0], 6);
  } else if (moveKey === 'B') {
    hitAll(state, targets, 4);
  } else {
    hit(state, targets[0], 10);
  }
  battle.rage = 0; // "ทุกครั้งที่บอสรับผลแอคชันของตัวเอง Rage รีเซ็ตเป็น 0" — after adding it to this hit.
}

function resolveSomnivar(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  const alive = aliveFighters(battle);
  const targets = bossMoveTargets(state, moveKey);
  if (moveKey === 'A') {
    hitAll(state, targets, 4);
    // The slot push hits everyone alive, not only whoever absorbed the damage — Guard redirects
    // hits, never the clock manipulation the move also carries.
    for (const f of alive) f.slot = Math.max(0, f.slot - 1);
  } else if (moveKey === 'B') {
    hitAll(state, targets, 11);
  } else {
    for (const f of alive) f.slot = Math.max(0, f.slot - 4);
  }
}

function resolveAurelius(state: GameState, moveKey: 'A' | 'B' | 'C') {
  const battle = state.battle!;
  const targets = bossMoveTargets(state, moveKey);
  if (moveKey === 'A') {
    if (targets.length === 0) return;
    // Procession pierces Blessing (v0.3.11). It exists as the catch-up mechanic — it hunts whoever
    // is winning on points — but measured only 6.9 of its printed 12 actually landing, because
    // party mitigation ate the rest. Piercing restores the function and matches the fantasy.
    hit(state, targets[0], 12, { piercesPartyMitigation: true });
  } else if (moveKey === 'B') {
    battle.armor += 1;
    battle.bossHp = Math.min(battle.bossHpMax, battle.bossHp + 8);
  } else {
    hitAll(state, targets, (f) => (f.hp < f.maxHp / 2 ? 14 : 7));
  }
}

export function bossArmorBaseline(bossId: string) {
  return BOSSES[bossId as keyof typeof BOSSES]?.armor ?? 0;
}
