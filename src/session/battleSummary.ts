// Derives "how did that actually go" numbers from a finished battle's event log.
//
// The end-game screens used to state only the outcome ("the clock reached midnight"), which left
// the most useful question unanswered: were we one hit short, or nowhere close? Everything here is
// read back out of `battle.log`, so no engine or save-format change is needed — but that also means
// it only ever describes the battle still held in `state.battle`, i.e. the final one. Earlier
// battles' logs are gone by then (prepareBattle swaps the whole BattleState object).

import type { BattleState, PlayerId } from '@engine/index';

export interface PlayerContribution {
  playerId: PlayerId;
  /** Damage this player actually landed on the boss (traps included, wasted actions excluded). */
  damageToBoss: number;
  /** Largest single hit — the number the stacked-buff combo is supposed to push up. */
  biggestHit: number;
  hits: number;
  healingDone: number;
  deaths: number;
}

export interface BattleSummary {
  bossHpRemaining: number;
  bossHpMax: number;
  /** Total damage the party got through, i.e. bossHpMax − bossHpRemaining. */
  damageDealt: number;
  markerLeft: number;
  contributions: PlayerContribution[];
}

export function summarizeBattle(battle: BattleState): BattleSummary {
  const byPlayer = new Map<PlayerId, PlayerContribution>();
  const contribution = (id: PlayerId): PlayerContribution => {
    let c = byPlayer.get(id);
    if (!c) {
      c = { playerId: id, damageToBoss: 0, biggestHit: 0, hits: 0, healingDone: 0, deaths: 0 };
      byPlayer.set(id, c);
    }
    return c;
  };
  // Seed every fighter so someone who never landed a hit still shows up with a zero row.
  for (const f of battle.fighters) contribution(f.playerId);

  for (const ev of battle.log) {
    switch (ev.t) {
      case 'RESOLVE_ATTACK': {
        if (ev.playerId === 'boss' || ev.targetId !== 'boss' || ev.wasted || ev.dmg <= 0) break;
        const c = contribution(ev.playerId);
        c.damageToBoss += ev.dmg;
        c.hits += 1;
        c.biggestHit = Math.max(c.biggestHit, ev.dmg);
        break;
      }
      case 'RESOLVE_TRAP_TRIGGER': {
        if (ev.dmg <= 0) break;
        const c = contribution(ev.ownerId);
        c.damageToBoss += ev.dmg;
        c.hits += 1;
        c.biggestHit = Math.max(c.biggestHit, ev.dmg);
        break;
      }
      case 'RESOLVE_HEAL': {
        if (ev.wasted || ev.amount <= 0) break;
        contribution(ev.playerId).healingDone += ev.amount;
        break;
      }
      case 'DEATH':
        contribution(ev.playerId).deaths += 1;
        break;
    }
  }

  return {
    bossHpRemaining: battle.bossHp,
    bossHpMax: battle.bossHpMax,
    damageDealt: battle.bossHpMax - battle.bossHp,
    markerLeft: battle.marker,
    contributions: [...byPlayer.values()].sort((a, b) => b.damageToBoss - a.damageToBoss),
  };
}
