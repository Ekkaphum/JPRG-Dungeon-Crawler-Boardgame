// The Seven Sins and Chess series — docs/BOSS_SERIES_DESIGN.md §3 and §4.
//
// One test per *rule*, not per boss: what these two series add is nine bosses that each tax a
// different resource, and the thing worth locking down is that each superlative reads the meter it
// is supposed to read and that nothing here leaks into the tuned three-boss game.

import { describe, it, expect } from 'vitest';
import {
  ALL_BOSS_IDS,
  BOSSES,
  CHESS_BOSS_IDS,
  CLASSIC_BOSS_IDS,
  LONG_RUN_BOSS_COUNT,
  SINS_BOSS_IDS,
  applyBossMove,
  createRNG,
  declareBossAction,
  hpForAct,
  newGame,
  prepareBattle,
  type BossId,
  type GameState,
  type RNG,
} from '@engine/index';
import { buildBossQueue } from '@engine/clock/setup';
import { gemsForPlayer } from '@engine/clock/camp';
import { GULVORAX_FREE_DAMAGE, MAMMORAX_START_HOARD, isBlackSlot } from '@engine/clock/bossRules';
import { applyDamageToBoss } from '@engine/clock/damage';
import { fixedDraftState } from './testUtils';

/** Scripted dice, same helper bosses.test.ts uses: every boss mechanic here is dice-driven. */
function dice(...values: number[]): RNG {
  let i = 0;
  return { ...createRNG(1), int: () => values[Math.min(i++, values.length - 1)] } as RNG;
}

/** A battle against `boss`, with the standard fixed Eric/Kit/Liora/Luna seating. */
function battleWith(boss: BossId): GameState {
  const state = fixedDraftState();
  state.bossQueue = [boss];
  state.bossIndex = 0;
  prepareBattle(state);
  return state;
}

describe('roster and modes', () => {
  it('keeps the tuned three as their own queue and adds the nine as a separate roster', () => {
    expect(CLASSIC_BOSS_IDS).toEqual(['Ragorath', 'Somnivar', 'Aurelius']);
    expect(SINS_BOSS_IDS).toHaveLength(7);
    expect(CHESS_BOSS_IDS).toHaveLength(5);
    expect(ALL_BOSS_IDS).toHaveLength(12);
    // Every boss belongs to exactly one series and declares the act it was designed for.
    for (const id of ALL_BOSS_IDS) {
      expect(['sins', 'chess']).toContain(BOSSES[id].series);
      expect(BOSSES[id].tier).toBeGreaterThanOrEqual(1);
      expect(BOSSES[id].tier).toBeLessThanOrEqual(5);
    }
  });

  it('defaults to the classic queue, so every existing caller is untouched', () => {
    const state = newGame({ players: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind: 'bot' as const })), difficulty: 'standard' }, 1);
    expect(state.mode).toBe('classic');
    expect(state.bossQueue).toEqual(CLASSIC_BOSS_IDS);
  });

  it('sins5 draws five of the seven, orders them by act, and is reproducible from the seed', () => {
    for (const seed of [1, 77, 4242]) {
      const q = buildBossQueue('sins5', seed);
      expect(q).toHaveLength(LONG_RUN_BOSS_COUNT);
      expect(new Set(q).size).toBe(LONG_RUN_BOSS_COUNT);
      for (const id of q) expect(SINS_BOSS_IDS).toContain(id);
      const tiers = q.map((id) => BOSSES[id].tier);
      expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
      // Same seed, same queue — otherwise a shared seed does not reproduce a shared game.
      expect(buildBossQueue('sins5', seed)).toEqual(q);
    }
  });

  it('sins5 never consumes the game\'s own RNG stream', () => {
    // The queue is drawn from a fork, so two games on one seed roll identically regardless of mode.
    const rngA = createRNG(99);
    const rngB = createRNG(99);
    buildBossQueue('sins5', 99);
    expect(rngA.int(1, 6)).toBe(rngB.int(1, 6));
  });

  it('free mode honours the picked order, drops duplicates, and tops a short list up to five', () => {
    const q = buildBossQueue('free', 1, ['Queen', 'Queen', 'PawnRank']);
    expect(q).toHaveLength(LONG_RUN_BOSS_COUNT);
    expect(q.filter((id) => id === 'Queen')).toHaveLength(1);
    expect(q).toContain('PawnRank');
  });

  it('reads per-act HP in the long modes and falls back to the printed number elsewhere', () => {
    // Levithar is designed for acts ② and ④ and prints a different number for each.
    expect(hpForAct('Levithar', 2)).not.toBe(hpForAct('Levithar', 4));
    // An act he was never designed for falls back rather than being invented.
    expect(hpForAct('Levithar', 5)).toBe(BOSSES.Levithar.hp);
  });
});

describe('§3.2 — one boss, one resource', () => {
  it('Levithar counts only buffs received from somebody else, and Dispossess hunts the receiver', () => {
    const state = battleWith('Levithar');
    const battle = state.battle!;
    const [eric, kit, liora] = battle.fighters;
    kit.buffsReceivedThisBattle = 5;
    eric.buffsReceivedThisBattle = 1;
    liora.buffsReceivedThisBattle = 0;
    const before = kit.hp;
    applyBossMove(state, 'B', dice(1));
    expect(kit.hp).toBeLessThan(before); // the most-buffed player, not the weakest
    expect(battle.envy).toBe(2);
    // And it strips what the party gave each other.
    expect(battle.partyBuff).toBeNull();
    expect(battle.fighters.every((f) => f.shield === null)).toBe(true);
  });

  it('Levithar\'s Overflow spends the whole meter and empties it', () => {
    const state = battleWith('Levithar');
    const battle = state.battle!;
    battle.envy = 9;
    const hp = battle.fighters.map((f) => f.hp);
    applyBossMove(state, 'C', dice(1));
    expect(battle.envy).toBe(0);
    battle.fighters.forEach((f, i) => expect(f.hp).toBeLessThan(hp[i]));
  });

  it('Gulvorax swallows whoever has been healed most, and 15 damage cuts them out', () => {
    const state = battleWith('Gulvorax');
    const battle = state.battle!;
    const [, kit] = battle.fighters;
    kit.healReceivedThisBattle = 20;
    applyBossMove(state, 'A', dice(1));
    expect(battle.swallowedId).toBe(kit.playerId);

    // While held, he cannot be aimed at: Digest with a full belly hits the swallowed player only.
    applyDamageToBoss(state, 0, GULVORAX_FREE_DAMAGE, { ignoresArmor: true, skillId: 'Slash' });
    expect(battle.swallowedId).toBeNull();
    expect(kit.slot).toBe(battle.marker);
  });

  it('Mammorax opens with a hoard, and only a big hit prises gold off it — into the robber\'s gems', () => {
    const state = battleWith('Mammorax');
    const battle = state.battle!;
    expect(battle.hoard).toBe(MAMMORAX_START_HOARD);

    // A small hit is eaten by the pile and robs nothing.
    applyDamageToBoss(state, 0, 3, { ignoresArmor: false, skillId: 'Slash' });
    expect(battle.hoard).toBe(MAMMORAX_START_HOARD);

    // A big one takes gold, and that gold is the robber's own payout — not the party's.
    applyDamageToBoss(state, 1, 20, { ignoresArmor: false, skillId: 'Slash' });
    expect(battle.hoard).toBeLessThan(MAMMORAX_START_HOARD);
    expect(gemsForPlayer(state, 1)).toBeGreaterThan(gemsForPlayer(state, 0));
  });

  it('Asmodeus lays an offer when he acts, and an untaken one costs him 10 HP and the turn', () => {
    const state = battleWith('Asmodeus');
    const battle = state.battle!;
    battle.bossSlot = battle.marker;

    declareBossAction(state, dice(1));
    expect(battle.offer).not.toBeNull();
    const hp = battle.bossHp;

    // Nobody took it. His next visit is spent, not swung.
    battle.bossSlot = battle.marker;
    declareBossAction(state, dice(1));
    expect(battle.bossHp).toBe(hp - 10);
    expect(battle.log.some((e) => e.t === 'BOSS_TURN_LOST' && e.reason === 'refused')).toBe(true);
  });

  it('Asmodeus\'s Kiss hunts whoever has taken the most offers, and pays them for it', () => {
    const state = battleWith('Asmodeus');
    const battle = state.battle!;
    const [, , liora] = battle.fighters;
    liora.offersAcceptedThisBattle = 3;
    const before = liora.hp;
    applyBossMove(state, 'B', dice(1));
    expect(liora.hp).toBeLessThan(before);
    expect(state.scoreLog.some((e) => e.playerId === liora.playerId && e.conditionId === 'asmodeusKiss')).toBe(true);
  });

  it('no two sins read the same meter', () => {
    // The series' whole organising principle (§3.2/§3.10). Asserted as a property of the data so a
    // tenth boss added later cannot quietly duplicate one of the seven.
    const state = battleWith('Levithar');
    const f = state.battle!.fighters[0];
    const meters = ['damageDealtThisBattle', 'buffsReceivedThisBattle', 'healReceivedThisBattle', 'offersAcceptedThisBattle', 'goldRobbedThisBattle'] as const;
    for (const m of meters) expect(f[m]).toBe(0);
    expect(new Set(meters).size).toBe(meters.length);
  });
});

describe('§1.1 — the shared two-phase flip', () => {
  it('flips at half HP, wipes the accumulated armor, and jumps the pawn to the marker', () => {
    const state = battleWith('Aurelius');
    const battle = state.battle!;
    battle.armor = 6;
    expect(battle.phase).toBe(1);

    applyDamageToBoss(state, 0, battle.bossHpMax, { ignoresArmor: true, skillId: 'Slash' });
    // That killed him outright — a dead boss is dead, not uncrowned.
    expect(battle.phase).toBe(1);

    const fresh = battleWith('Aurelius');
    const b2 = fresh.battle!;
    b2.armor = 6;
    applyDamageToBoss(fresh, 0, Math.ceil(b2.bossHpMax / 2), { ignoresArmor: true, skillId: 'Slash' });
    expect(b2.phase).toBe(2);
    expect(b2.armor).toBe(0);
    expect(b2.bossSlot).toBe(b2.marker);
    expect(b2.log.some((e) => e.t === 'BOSS_PHASE_2')).toBe(true);
  });

  it('reads the second sheet once flipped, and healing back over the line does not re-crown', () => {
    const state = battleWith('Aurelius');
    const battle = state.battle!;
    applyDamageToBoss(state, 0, Math.ceil(battle.bossHpMax / 2), { ignoresArmor: true, skillId: 'Slash' });
    expect(battle.phase).toBe(2);
    battle.bossHp = battle.bossHpMax;
    // Golden Throne is gone: phase 2's B climbs the clock instead of healing.
    const hp = battle.bossHp;
    battle.bossSlot = battle.marker;
    declareBossAction(state, dice(4));
    expect(battle.bossHp).toBeLessThanOrEqual(hp);
    expect(battle.phase).toBe(2);
  });
});

describe('§4 — the chess series moves by its own rules', () => {
  it('the Rook clears its printed ⏱ and then sails until a pawn stops it', () => {
    const state = battleWith('Rook');
    const battle = state.battle!;
    battle.bossSlot = battle.marker;
    for (const f of battle.fighters) f.slot = 5;
    declareBossAction(state, dice(1)); // A, ⏱4
    // It stopped one slot above the wall of pawns rather than walking a flat cooldown.
    expect(battle.bossSlot).toBe(6);
  });

  it('the Pawn Rank grows every turn, and being shoved backwards strips a rank', () => {
    const state = battleWith('PawnRank');
    const battle = state.battle!;
    battle.bossSlot = battle.marker;
    declareBossAction(state, dice(4)); // B — Close Ranks, rank +1
    expect(battle.pawnRank).toBe(1);
  });

  it('the Bishop makes the slot you stand on decide both halves of the exchange', () => {
    const state = battleWith('Bishop');
    const battle = state.battle!;
    const [eric, kit] = battle.fighters;
    eric.slot = 11; // black by default (odd)
    kit.slot = 10; // white
    expect(isBlackSlot(battle, eric.slot)).toBe(true);
    expect(isBlackSlot(battle, kit.slot)).toBe(false);

    const hpAfterBlack = (() => {
      const before = battle.bossHp;
      applyDamageToBoss(state, eric.playerId, 10, { ignoresArmor: false, skillId: 'Slash' });
      return before - battle.bossHp;
    })();
    const hpAfterWhite = (() => {
      const before = battle.bossHp;
      applyDamageToBoss(state, kit.playerId, 10, { ignoresArmor: false, skillId: 'Slash' });
      return before - battle.bossHp;
    })();
    // Black pierces armor and lands whole; white is halved.
    expect(hpAfterBlack).toBe(10);
    expect(hpAfterWhite).toBe(5 - battle.armor);

    // Invert swaps which parity is which, so everyone's plan is wrong at once.
    applyBossMove(state, 'B', dice(1));
    expect(isBlackSlot(battle, eric.slot)).toBe(false);
  });

  it('the King is beaten by position: pawns above and below win outright, no HP involved', () => {
    const state = battleWith('Queen');
    const battle = state.battle!;
    applyDamageToBoss(state, 0, Math.ceil(battle.bossHpMax / 2), { ignoresArmor: true, skillId: 'Slash' });
    expect(battle.phase).toBe(2);

    battle.bossSlot = 10;
    battle.marker = 10;
    battle.fighters[0].slot = 11;
    battle.fighters[1].slot = 9;
    declareBossAction(state, dice(1));
    expect(battle.outcome).toBe('boss_defeated');
    expect(battle.log.some((e) => e.t === 'CHECKMATE')).toBe(true);
  });
});

describe('nothing here leaks into the tuned three-boss game', () => {
  it('leaves every meter at rest in a classic battle', () => {
    const state = battleWith('Ragorath');
    const battle = state.battle!;
    battle.bossSlot = battle.marker;
    declareBossAction(state, dice(1, 1));
    expect(battle.phase).toBe(1);
    expect(battle.envy).toBe(0);
    expect(battle.hoard).toBe(0);
    expect(battle.offer).toBeNull();
    expect(battle.swallowedId).toBeNull();
    expect(battle.pawnRank).toBe(0);
    expect(battle.colorFlipped).toBe(false);
    expect(battle.bossPawns).toHaveLength(0);
  });
});
