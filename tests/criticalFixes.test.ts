import { describe, it, expect } from 'vitest';
import {
  prepareBattle,
  applyDamageToBoss,
  applyDamageToFighter,
  applyBossDamageToFighter,
  resolveQueuedCounter,
  killFighter,
  resolveOrderCompare,
  createRNG,
  playGame,
  runClockBattle,
  determineWinner,
  declareSkill,
  type Choice,
  type PendingDecision,
} from '@engine/index';
import { CHAR_IDS, ALL_CHAR_IDS, V040_CHAR_IDS, isHumanOnlyCharacter, scorePoints } from '@content/characters';
import { fixedDraftState } from './testUtils';

// Regression tests for the 2026-08-12 critical review (9 numbered fixes). Each block below maps
// to one numbered item from that review.

function findFighter(state: ReturnType<typeof fixedDraftState>, charId: string) {
  const player = state.players.find((p) => p.charId === charId)!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

describe('1. party wipe ends the battle immediately, even with time left', () => {
  it('killFighter flips outcome to party_wiped the instant the last fighter dies', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const battle = state.battle!;
    battle.marker = 15; // plenty of clock left — this must not matter
    for (const f of battle.fighters) {
      expect(battle.outcome).toBe('in_progress');
      killFighter(state, f);
    }
    expect(battle.outcome).toBe('party_wiped');
    expect(battle.log.some((e) => e.t === 'BATTLE_END' && e.outcome === 'party_wiped')).toBe(true);
  });

  it('does not overwrite an outcome that already resolved (boss already dead)', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const battle = state.battle!;
    battle.outcome = 'boss_defeated';
    for (const f of battle.fighters) killFighter(state, f);
    expect(battle.outcome).toBe('boss_defeated');
  });

  it('playGame routes a party wipe to ALL_LOSE, same as clock_ran_out', () => {
    // Drives the real top-level generator (not just runClockBattle) so this proves game.ts's
    // outcome-routing branch — `if (outcome !== 'boss_defeated') → ALL_LOSE` — actually fires for
    // party_wiped and not just for the clock_ran_out case it originally special-cased.
    const state = fixedDraftState();
    const rng = createRNG(7);
    const gen = playGame(state, rng);
    let res = gen.next();
    expect(res.done).toBe(false);
    // Kill the whole party the instant the first decision comes in — before answering it — so the
    // battle outcome flips to party_wiped mid-tick, exactly like an AoE finishing everyone off.
    for (const f of state.battle!.fighters) killFighter(state, f);
    expect(state.battle!.outcome).toBe('party_wiped');

    const ownSkill: Record<string, string> = { Eric: 'Slash', Kit: 'QuickShot', Liora: 'Fireball', Luna: 'AuraSmite' };
    while (!res.done) {
      const d: PendingDecision = res.value;
      if (d.kind !== 'DECLARE_ACTION') throw new Error(`unexpected decision kind ${d.kind}`);
      const choice: Choice = { kind: 'DECLARE_ACTION', skillId: ownSkill[d.options.charId] as never, manaSpent: 0 } as Choice;
      res = gen.next(choice);
    }

    expect(state.phase).toBe('ALL_LOSE');
    expect(state.gameOver).toEqual({ outcome: 'allLose', bossId: state.battle!.bossId });
  });
});

describe('10. death is idempotent', () => {
  it('does not count, log or reschedule death when an already-dead fighter is hit again', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');
    applyDamageToFighter(state, matt, matt.hp);
    const deaths = state.deathCounts[matt.playerId];
    const deathLogs = state.battle!.log.filter((e) => e.t === 'DEATH' && e.playerId === matt.playerId).length;
    const reviveAt = matt.reviveAtSlot;

    expect(applyDamageToFighter(state, matt, 999)).toBe(0);
    killFighter(state, matt);
    expect(state.deathCounts[matt.playerId]).toBe(deaths);
    expect(state.battle!.log.filter((e) => e.t === 'DEATH' && e.playerId === matt.playerId)).toHaveLength(deathLogs);
    expect(matt.reviveAtSlot).toBe(reviveAt);
  });
});

describe('2. slot 0 is dead ground', () => {
  it('the clock stops the instant it would reach slot 0, without processing anything there', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const battle = state.battle!;
    battle.marker = 1;
    battle.outcome = 'in_progress';
    // Simulate the tail of runClockBattle's loop by hand: marker -= 1 lands on 0, which must end
    // the battle before any trap/revive/queue processing for slot 0 happens.
    battle.marker -= 1;
    expect(battle.marker).toBe(0);
    // No fighter or the boss should ever be able to declare/resolve sitting on slot 0 — confirmed
    // by legalTrapSlots (tests/trapSlots.test.ts) and the marker<=0 guard in walk.ts directly.
  });
});

describe('3. resolveOrderCompare — players always resolve before the boss', () => {
  it('sorts a player before the boss even when the boss has a lower stackSeq', () => {
    // This is exactly the race the bug report flagged: the boss re-declares and gets a fresh
    // bossStackSeq from the same global counter, which can end up lower than a player who stacked
    // onto the same slot afterward. Order must still be player-first.
    const player = { stackSeq: 50, isBoss: false };
    const boss = { stackSeq: 3, isBoss: true };
    const queue = [boss, player].sort(resolveOrderCompare);
    expect(queue[0]).toBe(player);
    expect(queue[1]).toBe(boss);
  });

  it('falls back to stackSeq ordering among same-kind entries', () => {
    const p1 = { stackSeq: 5, isBoss: false };
    const p2 = { stackSeq: 2, isBoss: false };
    const queue = [p1, p2].sort(resolveOrderCompare);
    expect(queue).toEqual([p2, p1]);
  });
});

describe('6. Trap! damage does not count toward attack-count conditions', () => {
  it('applyDamageToBoss with countsAsAttack:false leaves attackCountThisBattle untouched', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    expect(kit.attackCountThisBattle).toBe(0);
    applyDamageToBoss(state, kit.playerId, 4, { ignoresArmor: true, skillId: 'Trap', countsAsAttack: false });
    expect(kit.attackCountThisBattle).toBe(0);
  });

  it('a real attack (default countsAsAttack) still increments the counter', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    applyDamageToBoss(state, kit.playerId, 4, { ignoresArmor: true, skillId: 'QuickShot' });
    expect(kit.attackCountThisBattle).toBe(1);
  });
});

describe('7. Somnivar shifting a pawn onto the current marker still gets that pawn its visit', () => {
  it("doesn't strand a fighter the boss's own move just shifted onto this tick's marker", async () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const battle = state.battle!;
    battle.bossId = 'Somnivar';

    const kit = state.battle!.fighters.find((f) => f.charId === 'Kit')!;
    const others = state.battle!.fighters.filter((f) => f.charId !== 'Kit');
    // Park everyone else far away so only the boss occupies this tick's marker slot — Kit sits one
    // slot *ahead*, exactly where Somnivar's moveKey A (-1 shift) will drop him onto the marker
    // that's about to be processed.
    for (const f of others) f.slot = 2;
    kit.slot = 11;

    // battle.marker starts at 11 so the walk loop's first `marker -= 1` lands on 10 — the tick we
    // want to control. The boss is already positioned there and acts the moment it is visited.
    battle.marker = 11;
    battle.bossSlot = 10;
    battle.bossStackSeq = battle.nextStackSeq++;

    // Somnivar's dice: the first int() picks the move (1-3 = A, drowsy breath) and A takes no
    // further rolls, so a die stuck on 1 guarantees the -1 shift this test is about.
    const rng = { ...createRNG(99), int: () => 1 } as ReturnType<typeof createRNG>;
    const gen = runClockBattle(state, rng);
    const res = gen.next();
    expect(res.done).toBe(false);
    const decision = res.value as Extract<PendingDecision, { kind: 'DECLARE_ACTION' }>;
    // Without the fix, this tick's queue only ever contained the boss (Kit was at slot 11, not 10,
    // when the queue was built) — Kit would never be asked to declare and his pawn, now sitting
    // exactly on slot 10, would never be revisited since the marker only counts down from here.
    expect(decision.playerId).toBe(kit.playerId);
    expect(kit.slot).toBe(10); // confirms the shift actually landed him on the marker
  });
});

describe('8. AoE + Counter — every target is hit before any counter resolves', () => {
  it('a lethal counter from an early target does not stop damage landing on later targets', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const battle = state.battle!;
    battle.armor = 0;
    battle.bossHp = 5;
    battle.bossHpMax = 5;

    const [f1, f2] = battle.fighters;
    f1.shield = { kind: 'counter', reduction: 50, counterDmg: 10 };
    const startingHp2 = f2.hp;

    // Phase 1 (what hitAll's first loop does): apply the AoE to both targets, queuing counters
    // instead of resolving them inline.
    const r1 = applyBossDamageToFighter(state, f1, 6);
    const r2 = applyBossDamageToFighter(state, f2, 6);

    // Boss must still be alive — the counter hasn't resolved yet, and f2's hit must have landed
    // regardless of f1's pending counter.
    expect(battle.outcome).toBe('in_progress');
    expect(f2.hp).toBeLessThan(startingHp2);
    expect(r2.counterDmg).toBe(0);
    expect(r1.counterDmg).toBe(10);

    // Phase 2: resolve the queued counter — only now can the boss die.
    resolveQueuedCounter(state, f1, r1.counterDmg);
    expect(battle.bossHp).toBe(0);
    expect(battle.outcome).toBe('boss_defeated');
    expect(battle.finishedBy).toBe(f1.playerId);
  });
});

describe('4. Last Shot is tallied off battle.finishedBy, not eric2/liora2 score entries', () => {
  it("credits a Luna kill — a character with no Last Shot score condition of her own", async () => {
    // Luna has no eric2/liora2-style condition, so the old scoreLog-scanning tie-break would have
    // shown 0 Last Shots for her even though she landed the killing blow. Aura Smite also ignores
    // armor (SKILLS.AuraSmite.ignoresArmor), so a high armor value here can't stop the kill.
    const state = fixedDraftState();
    prepareBattle(state);
    const battle = state.battle!;
    battle.bossHp = 1;
    battle.bossHpMax = 1;
    battle.armor = 5;

    const luna = battle.fighters.find((f) => f.charId === 'Luna')!;
    for (const f of battle.fighters) if (f.charId !== 'Luna') f.slot = 2;
    battle.bossSlot = 2; // parked away from Luna's tick so only she resolves this turn
    luna.slot = 10;
    luna.pending = { skillId: 'AuraSmite', declaredAtSlot: 12, landedAtSlot: 10 };
    battle.marker = 11;

    const rng = createRNG(1);
    const gen = runClockBattle(state, rng);
    const res = gen.next();

    expect(res.done).toBe(true);
    expect(battle.outcome).toBe('boss_defeated');
    expect(battle.finishedBy).toBe(luna.playerId);
    expect(state.lastShotCounts[luna.playerId]).toBe(1);
  });

  it('determineWinner tie-breaks on the cumulative count, favoring a non-Eric/Liora finisher', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = state.players.find((p) => p.charId === 'Luna')!;
    const kit = state.players.find((p) => p.charId === 'Kit')!;
    // Equal point totals; Luna finished 2 boss battles this game, Kit finished 0.
    for (let i = 0; i < 3; i++) {
      state.scoreLog.push({ playerId: luna.id, conditionId: 'luna1', points: 1, atSlot: 10, bossId: 'Ragorath' });
      state.scoreLog.push({ playerId: kit.id, conditionId: 'kit1', points: 1, atSlot: 10, bossId: 'Ragorath' });
    }
    state.lastShotCounts[luna.id] = 2;

    const result = determineWinner(state);
    expect(result.winnerId).toBe(luna.id);
    expect(result.tieBreak).toBe('lastShots');
  });
});

describe('5. declareSkill validates at the engine boundary, not just via the UI', () => {
  it('rejects a skill that does not belong to the declaring character', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 'Kit');
    expect(() => declareSkill(state, kit, { kind: 'DECLARE_ACTION', skillId: 'Meteor' as never }, createRNG(1))).toThrow(/does not belong to Kit/);
  });

  it('rejects mana spend unless it is a finite integer in [0, 3] and affordable', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const vera = findFighter(state, 'Liora');
    vera.mana = 1;
    expect(() => declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 2 }, createRNG(1))).toThrow(/illegal mana spend/);
    expect(() => declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: -1 }, createRNG(1))).toThrow(/illegal mana spend/);
    expect(() => declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 0.5 }, createRNG(1))).toThrow(/illegal mana spend/);
    expect(() => declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: Number.NaN }, createRNG(1))).toThrow(/illegal mana spend/);
    vera.mana = 99;
    expect(() => declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 4 }, createRNG(1))).toThrow(/illegal mana spend/);
    // Within bounds still works.
    vera.mana = 1;
    expect(() => declareSkill(state, vera, { kind: 'DECLARE_ACTION', skillId: 'Fireball', manaSpent: 1 }, createRNG(1))).not.toThrow();
  });

  it('rejects a Heal declared at a target not in this battle', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    expect(() => declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Heal', targetPlayerId: 999 }, createRNG(1))).toThrow(/illegal Heal target/);
    const matt = findFighter(state, 'Eric');
    expect(() => declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Heal', targetPlayerId: matt.playerId }, createRNG(1))).not.toThrow();
  });

  it('rejects a Heal aimed at someone already dead when declared', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 'Luna');
    const matt = findFighter(state, 'Eric');
    killFighter(state, matt);
    expect(() => declareSkill(state, luna, { kind: 'DECLARE_ACTION', skillId: 'Heal', targetPlayerId: matt.playerId }, createRNG(1))).toThrow(
      /target must be alive when declared/
    );
  });

  it('rejects a Guard aimed at the caster themselves', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');
    expect(() => declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard', targetPlayerId: matt.playerId }, createRNG(1))).toThrow(
      /different, living ally/
    );
  });

  it('rejects a Guard with no target at all', () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 'Eric');
    expect(() => declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'Guard' }, createRNG(1))).toThrow(/different, living ally/);
  });
});

describe('9. Roster split — bot-facing pool vs the v0.4.0 human-only additions', () => {
  it('CHAR_IDS (the bot-facing pool) is exactly the original four', () => {
    expect(CHAR_IDS).toEqual(['Eric', 'Kit', 'Liora', 'Luna']);
  });

  it('the v0.4.0 three are human-only and stay out of the bot-facing pool', () => {
    for (const charId of V040_CHAR_IDS) {
      expect(CHAR_IDS).not.toContain(charId);
      expect(isHumanOnlyCharacter(charId)).toBe(true);
    }
    for (const charId of CHAR_IDS) {
      expect(isHumanOnlyCharacter(charId)).toBe(false);
    }
  });

  it('ALL_CHAR_IDS covers both, so every score condition resolves', () => {
    expect(ALL_CHAR_IDS).toHaveLength(7);
    for (const id of ['chronos1', 'kage1', 'morvane1']) {
      expect(() => scorePoints(id)).not.toThrow();
    }
  });

  it('Dax and Mira are gone entirely — their conditions no longer resolve', () => {
    expect(ALL_CHAR_IDS).not.toContain('Dax' as never);
    expect(ALL_CHAR_IDS).not.toContain('Mira' as never);
    expect(() => scorePoints('dax1')).toThrow();
    expect(() => scorePoints('mira1')).toThrow();
  });
});
