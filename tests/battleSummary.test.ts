import { describe, it, expect } from 'vitest';
import { prepareBattle } from '@engine/index';
import { summarizeBattle } from '@session/battleSummary';
import { fixedDraftState } from './testUtils';

// The end screens read these numbers straight out of the finished battle's log, so the accounting
// has to match what actually happened: wasted actions and hits on players must not count as boss
// damage, and traps must be credited to the Kit who armed them rather than to nobody.

function battleWithLog(events: Parameters<typeof pushAll>[1]) {
  const state = fixedDraftState();
  prepareBattle(state);
  const battle = state.battle!;
  battle.log.length = 0;
  pushAll(battle, events);
  return { state, battle };
}

function pushAll(battle: { log: unknown[] }, events: unknown[]) {
  for (const e of events) battle.log.push(e);
}

describe('summarizeBattle', () => {
  it('credits damage, hits and biggest hit per player', () => {
    const { battle } = battleWithLog([
      { t: 'RESOLVE_ATTACK', playerId: 0, skillId: 'Slash', targetId: 'boss', dmg: 6, wasted: false },
      { t: 'RESOLVE_ATTACK', playerId: 0, skillId: 'Slash', targetId: 'boss', dmg: 11, wasted: false },
      { t: 'RESOLVE_ATTACK', playerId: 1, skillId: 'QuickShot', targetId: 'boss', dmg: 4, wasted: false },
    ]);
    battle.bossHp = battle.bossHpMax - 21;

    const s = summarizeBattle(battle);
    const p0 = s.contributions.find((c) => c.playerId === 0)!;
    const p1 = s.contributions.find((c) => c.playerId === 1)!;

    expect(p0.damageToBoss).toBe(17);
    expect(p0.hits).toBe(2);
    expect(p0.biggestHit).toBe(11);
    expect(p1.damageToBoss).toBe(4);
    expect(s.damageDealt).toBe(21);
    expect(s.bossHpRemaining).toBe(battle.bossHpMax - 21);
  });

  it('ignores wasted attacks, zero-damage hits, and damage aimed at players', () => {
    const { battle } = battleWithLog([
      { t: 'RESOLVE_ATTACK', playerId: 0, skillId: 'Slash', targetId: 'boss', dmg: 11, wasted: true },
      { t: 'RESOLVE_ATTACK', playerId: 0, skillId: 'Slash', targetId: 'boss', dmg: 0, wasted: false },
      { t: 'RESOLVE_ATTACK', playerId: 'boss', skillId: 'BossMove', targetId: 0, dmg: 9, wasted: false },
    ]);

    const p0 = summarizeBattle(battle).contributions.find((c) => c.playerId === 0)!;
    expect(p0.damageToBoss).toBe(0);
    expect(p0.hits).toBe(0);
  });

  it('credits trap damage to the trap owner', () => {
    const { battle } = battleWithLog([{ t: 'RESOLVE_TRAP_TRIGGER', slot: 12, dmg: 4, ownerId: 1 }]);

    const p1 = summarizeBattle(battle).contributions.find((c) => c.playerId === 1)!;
    expect(p1.damageToBoss).toBe(4);
    expect(p1.hits).toBe(1);
  });

  it('tracks healing and deaths', () => {
    const { battle } = battleWithLog([
      { t: 'RESOLVE_HEAL', playerId: 3, targetId: 0, amount: 6, wasted: false },
      { t: 'RESOLVE_HEAL', playerId: 3, targetId: 0, amount: 6, wasted: true },
      { t: 'DEATH', playerId: 2, atSlot: 8, reviveAtSlot: 2 },
    ]);

    const s = summarizeBattle(battle);
    expect(s.contributions.find((c) => c.playerId === 3)!.healingDone).toBe(6);
    expect(s.contributions.find((c) => c.playerId === 2)!.deaths).toBe(1);
  });

  it('lists every fighter even when they never landed a hit, sorted by damage', () => {
    const { battle } = battleWithLog([{ t: 'RESOLVE_ATTACK', playerId: 2, skillId: 'Fireball', targetId: 'boss', dmg: 8, wasted: false }]);

    const s = summarizeBattle(battle);
    expect(s.contributions).toHaveLength(4);
    expect(s.contributions[0].playerId).toBe(2);
    expect(s.contributions.slice(1).every((c) => c.damageToBoss === 0)).toBe(true);
  });
});
