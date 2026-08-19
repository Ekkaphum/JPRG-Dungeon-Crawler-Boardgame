import { describe, it, expect } from 'vitest';
import {
  prepareBattle,
  declareSkill,
  resolveFighterPending,
  onBattleEndScoring,
  dealDamageToFighterFromBoss,
  applyBossMove,
  createRNG,
  healFighter,
  draftPoolFor,
  newGame,
} from '@engine/index';
import {
  SAND_PER_REWIND,
  SHADOW_PER_ASSASSINATE,
  SOULS_PER_DEATH_COIL,
  SOULS_PER_POINT,
  SOUL_HP_LOSS_THRESHOLD,
  V040_CHAR_IDS,
  scorePoints,
} from '@content/characters';
import { playGame } from '@engine/index';
import type { Choice, NewGameSetup, PendingDecision } from '@engine/index';
import { createEasyBot } from '@bots/easy';
import { fixedDraftState, setPlayerCharacter } from './testUtils';

// v0.4.0 is opt-in and human-only, so almost every test here has to build its state with the v0.4
// ruleset explicitly — the default is still v0.3 and behaves exactly as it always did.

function v040State(assign: Partial<Record<number, 'Chrono' | 'Kage' | 'Morvane'>> = {}) {
  const state = fixedDraftState();
  state.ruleset = 'v0.4';
  for (const [idx, charId] of Object.entries(assign)) {
    setPlayerCharacter(state, Number(idx), charId!);
  }
  prepareBattle(state);
  return state;
}

function findFighter(state: ReturnType<typeof fixedDraftState>, charId: string) {
  const player = state.players.find((p) => p.charId === charId)!;
  return state.battle!.fighters.find((f) => f.playerId === player.id)!;
}

describe('v0.4.0 draft gating — human seats only, and only under the v0.4 ruleset', () => {
  const setup = {
    players: [
      { name: 'You', kind: 'human' as const },
      { name: 'Bot 1', kind: 'bot' as const, botLevel: 'hard' as const },
      { name: 'Bot 2', kind: 'bot' as const, botLevel: 'hard' as const },
      { name: 'Bot 3', kind: 'bot' as const, botLevel: 'hard' as const },
    ],
    difficulty: 'standard' as const,
  };

  it('the stable ruleset offers nobody the new characters', () => {
    const state = newGame(setup, 1);
    expect(state.ruleset).toBe('v0.3');
    for (const p of state.players) {
      expect(draftPoolFor(state, p.id)).toEqual(['Eric', 'Kit', 'Liora', 'Luna']);
    }
  });

  it('under v0.4 the human seat is offered them and every bot seat is not', () => {
    const state = newGame({ ...setup, ruleset: 'v0.4' }, 1);
    expect(draftPoolFor(state, 0)).toHaveLength(7);
    for (const charId of V040_CHAR_IDS) {
      expect(draftPoolFor(state, 0)).toContain(charId);
      // The whole point of the gate: a bot has no heuristic for sand/shadow/souls, so letting it
      // hold one would measure the bot rather than the character.
      for (const botId of [1, 2, 3]) {
        expect(draftPoolFor(state, botId)).not.toContain(charId);
      }
    }
  });
});

describe('Chrono', () => {
  it('Time Spiral banks sand on slow declares only, and Rewind cannot part-fund itself', () => {
    const state = v040State({ 0: 'Chrono' });
    const c = findFighter(state, 'Chrono');
    expect(c.sand).toBe(0);

    declareSkill(state, c, { kind: 'DECLARE_ACTION', skillId: 'Tick' }, createRNG(1)); // ⏱2 — too fast
    expect(c.sand).toBe(0);

    // Hourglass Shard is ⏱3, which is exactly the bar. This is the reason the bar is 3 and not 4:
    // at 4 his only qualifying card was Rewind, which spends sand, so the meter could never start.
    for (let i = 0; i < SAND_PER_REWIND; i++) {
      c.slot = state.battle!.marker;
      declareSkill(state, c, { kind: 'DECLARE_ACTION', skillId: 'HourglassShard' }, createRNG(1));
    }
    expect(c.sand).toBe(SAND_PER_REWIND);
  });

  it('Rewind walks the marker back up and cannot re-trigger anything, because every pawn is below it', () => {
    const state = v040State({ 0: 'Chrono' });
    const battle = state.battle!;
    const c = findFighter(state, 'Chrono');
    c.sand = SAND_PER_REWIND;
    battle.marker = 12;
    // Every pawn always sits at or below the marker in a real game; mirror that here, because it is
    // precisely the invariant that makes rewinding safe.
    for (const f of battle.fighters) f.slot = 11;
    c.slot = 12;
    const pawnsBefore = new Map(battle.fighters.map((f) => [f.playerId, f.slot]));

    declareSkill(state, c, { kind: 'DECLARE_ACTION', skillId: 'Rewind' }, createRNG(1));

    expect(battle.marker).toBe(15); // 12 + primary 3
    expect(c.sand).toBe(1); // spent 3, then banked 1 for the ⏱6 declare itself
    // Chrono's own pawn moved because he declared; nobody else's did, and none of them ended up
    // at or above the new marker — which is what makes the rewind safe.
    for (const f of battle.fighters) {
      if (f.playerId !== c.playerId) expect(f.slot).toBe(pawnsBefore.get(f.playerId));
      expect(f.slot).toBeLessThan(battle.marker);
    }
  });

  it('Rewind is refused without enough sand', () => {
    const state = v040State({ 0: 'Chrono' });
    const c = findFighter(state, 'Chrono');
    c.sand = SAND_PER_REWIND - 1;
    expect(() => declareSkill(state, c, { kind: 'DECLARE_ACTION', skillId: 'Rewind' }, createRNG(1))).toThrow(/sand/);
  });

  it('never lets the marker exceed the clock it started with', () => {
    const state = v040State({ 0: 'Chrono' });
    const battle = state.battle!;
    const c = findFighter(state, 'Chrono');
    c.sand = SAND_PER_REWIND;
    battle.marker = 23;
    declareSkill(state, c, { kind: 'DECLARE_ACTION', skillId: 'Rewind' }, createRNG(1));
    expect(battle.marker).toBe(24);
  });

  it('Haste drags an ally up the clock but never onto or past the marker', () => {
    const state = v040State({ 0: 'Chrono' });
    const battle = state.battle!;
    const c = findFighter(state, 'Chrono');
    const ally = battle.fighters.find((f) => f.playerId !== c.playerId)!;
    battle.marker = 20;
    c.slot = 20;
    ally.slot = 14;

    declareSkill(state, c, { kind: 'DECLARE_ACTION', skillId: 'Haste', targetPlayerId: ally.playerId }, createRNG(1));

    expect(ally.slot).toBe(16); // 14 + primary 2, well clear of the cap
    expect(ally.hastedByPlayerId).toBe(c.playerId);
  });

  it('Haste on an ally already at the marker is a no-op, and leaves no false credit behind', () => {
    // The UI must disable this case (it reads as a dead button otherwise), but the engine has to be
    // honest about it too: no move, and crucially no hastedByPlayerId — chrono2 must not pay out
    // for a visit Chrono did not actually buy.
    const state = v040State({ 0: 'Chrono' });
    const battle = state.battle!;
    const c = findFighter(state, 'Chrono');
    const ally = battle.fighters.find((f) => f.playerId !== c.playerId)!;
    battle.marker = 23;
    c.slot = 23;
    ally.slot = 23;

    declareSkill(state, c, { kind: 'DECLARE_ACTION', skillId: 'Haste', targetPlayerId: ally.playerId }, createRNG(1));

    expect(ally.slot).toBe(23);
    expect(ally.hastedByPlayerId).toBeNull();
  });

  it('Haste can never place an ally on or past the marker', () => {
    const state = v040State({ 0: 'Chrono' });
    const battle = state.battle!;
    const c = findFighter(state, 'Chrono');
    const ally = battle.fighters.find((f) => f.playerId !== c.playerId)!;
    battle.marker = 20;
    c.slot = 20;
    ally.slot = 19; // already as far up as it is legal to be

    declareSkill(state, c, { kind: 'DECLARE_ACTION', skillId: 'Haste', targetPlayerId: ally.playerId }, createRNG(1));

    expect(ally.slot).toBe(19);
    expect(ally.slot).toBeLessThan(battle.marker);
  });

  it('chrono1 scores only when the call matches the move the boss actually rolled', () => {
    const state = v040State({ 0: 'Chrono' });
    const c = findFighter(state, 'Chrono');

    c.predictedBossMove = 'B';
    applyBossMove(state, 'B', createRNG(1));
    expect(state.scoreLog.filter((e) => e.conditionId === 'chrono1')).toHaveLength(1);
    // Cleared either way — a prediction is a commitment for exactly one boss action.
    expect(c.predictedBossMove).toBeNull();

    c.predictedBossMove = 'A';
    applyBossMove(state, 'C', createRNG(1));
    expect(state.scoreLog.filter((e) => e.conditionId === 'chrono1')).toHaveLength(1);
    expect(c.predictedBossMove).toBeNull();
  });

  it('chrono3 pays only when the battle ends with the clock still healthy', () => {
    const state = v040State({ 0: 'Chrono' });
    state.battle!.outcome = 'boss_defeated';
    state.battle!.marker = 8;
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.conditionId === 'chrono3')).toBe(true);

    const lean = v040State({ 0: 'Chrono' });
    lean.battle!.outcome = 'boss_defeated';
    lean.battle!.marker = 7;
    onBattleEndScoring(lean);
    expect(lean.scoreLog.some((e) => e.conditionId === 'chrono3')).toBe(false);
  });
});

describe('Kage', () => {
  it('Smoke Bomb hides everyone sharing his slot, not just him', () => {
    const state = v040State({ 1: 'Kage' });
    const battle = state.battle!;
    const kage = findFighter(state, 'Kage');
    const together = battle.fighters.find((f) => f.playerId !== kage.playerId)!;
    const apart = battle.fighters.find((f) => f.playerId !== kage.playerId && f.playerId !== together.playerId)!;
    together.slot = kage.slot;
    apart.slot = kage.slot - 5;

    declareSkill(state, kage, { kind: 'DECLARE_ACTION', skillId: 'SmokeBomb' }, createRNG(1));

    expect(kage.stealthUntilSlot).not.toBeNull();
    expect(together.stealthUntilSlot).not.toBeNull();
    expect(apart.stealthUntilSlot).toBeNull();
  });

  it('the first strike out of stealth is buffed, breaks stealth, and scores kage2', () => {
    const state = v040State({ 1: 'Kage' });
    const kage = findFighter(state, 'Kage');
    const bossHpBefore = state.battle!.bossHp;
    kage.stealthUntilSlot = 0;
    kage.stealthStrikeBonus = 3;

    // Shuriken is ⚡ immediate, so declaring it resolves the hit right here.
    declareSkill(state, kage, { kind: 'DECLARE_ACTION', skillId: 'Shuriken' }, createRNG(1));

    expect(bossHpBefore - state.battle!.bossHp).toBe(3 + 3); // base 3 + stealth bonus 3
    expect(kage.stealthUntilSlot).toBeNull();
    expect(state.scoreLog.some((e) => e.conditionId === 'kage2')).toBe(true);
  });

  it('Assassinate needs shadow, spends it on declare, and executes a wounded boss harder', () => {
    const state = v040State({ 1: 'Kage' });
    const kage = findFighter(state, 'Kage');
    expect(() => declareSkill(state, kage, { kind: 'DECLARE_ACTION', skillId: 'Assassinate' }, createRNG(1))).toThrow(/shadow/);

    // Healthy boss: no execute window, so the plain primary lands.
    kage.shadow = SHADOW_PER_ASSASSINATE;
    const full = state.battle!.bossHp;
    declareSkill(state, kage, { kind: 'DECLARE_ACTION', skillId: 'Assassinate' }, createRNG(1));
    expect(kage.shadow).toBe(0); // spent on declare, not on resolve
    resolveFighterPending(state, kage, createRNG(1));
    expect(full - state.battle!.bossHp).toBe(12);

    // Wounded boss: the execute bonus applies. Measured off damageDealtThisBattle rather than the
    // HP delta, because HP floors at 0 and would hide the difference.
    const low = v040State({ 1: 'Kage' });
    const k2 = findFighter(low, 'Kage');
    k2.shadow = SHADOW_PER_ASSASSINATE;
    low.battle!.bossHp = Math.floor(low.battle!.bossHpMax * 0.2);
    k2.slot = low.battle!.marker;
    declareSkill(low, k2, { kind: 'DECLARE_ACTION', skillId: 'Assassinate' }, createRNG(1));
    resolveFighterPending(low, k2, createRNG(1));
    expect(k2.damageDealtThisBattle).toBeGreaterThan(12);
  });

  it('being hit by the boss wipes his shadow and latches kage3 shut for the rest of the battle', () => {
    const state = v040State({ 1: 'Kage' });
    const kage = findFighter(state, 'Kage');
    kage.shadow = 3;
    expect(kage.everHitByBossThisBattle).toBe(false);

    dealDamageToFighterFromBoss(state, kage, 4);

    expect(kage.shadow).toBe(0);
    expect(kage.everHitByBossThisBattle).toBe(true);

    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.conditionId === 'kage3')).toBe(false);
  });

  it('kage1 pays only when Assassinate itself lands the killing blow', () => {
    const state = v040State({ 1: 'Kage' });
    const kage = findFighter(state, 'Kage');
    state.battle!.outcome = 'boss_defeated';
    state.battle!.finishedBy = kage.playerId;
    state.battle!.finishedBySkill = 'Shuriken';
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.conditionId === 'kage1')).toBe(false);

    const clean = v040State({ 1: 'Kage' });
    const k2 = findFighter(clean, 'Kage');
    clean.battle!.outcome = 'boss_defeated';
    clean.battle!.finishedBy = k2.playerId;
    clean.battle!.finishedBySkill = 'Assassinate';
    onBattleEndScoring(clean);
    expect(clean.scoreLog.find((e) => e.conditionId === 'kage1')?.points).toBe(scorePoints('kage1'));
  });
});

describe('Morvane', () => {
  it('is undead: no heal can touch him, but his own Drain can', () => {
    const state = v040State({ 3: 'Morvane' });
    const m = findFighter(state, 'Morvane');
    m.hp = 4;

    expect(healFighter(m, 6)).toBe(0);
    expect(m.hp).toBe(4);

    // Drain is ⚡ immediate, and its lifesteal is the one path that does restore him.
    declareSkill(state, m, { kind: 'DECLARE_ACTION', skillId: 'Drain' }, createRNG(1));
    expect(m.hp).toBe(5);
  });

  it('gains a soul from a real wound but not from chip damage', () => {
    const state = v040State({ 3: 'Morvane' });
    const m = findFighter(state, 'Morvane');

    dealDamageToFighterFromBoss(state, m, SOUL_HP_LOSS_THRESHOLD - 1);
    expect(m.souls).toBe(0);

    dealDamageToFighterFromBoss(state, m, SOUL_HP_LOSS_THRESHOLD);
    expect(m.souls).toBe(1);
  });

  it('scores morvane1 once per completed set of souls, never re-scoring the pile', () => {
    const state = v040State({ 3: 'Morvane' });
    const m = findFighter(state, 'Morvane');
    for (let i = 0; i < SOULS_PER_POINT; i++) dealDamageToFighterFromBoss(state, m, SOUL_HP_LOSS_THRESHOLD);
    expect(state.scoreLog.filter((e) => e.conditionId === 'morvane1')).toHaveLength(1);

    // Souls short of the next set pay nothing more.
    dealDamageToFighterFromBoss(state, m, SOUL_HP_LOSS_THRESHOLD);
    expect(state.scoreLog.filter((e) => e.conditionId === 'morvane1')).toHaveLength(1);
  });

  it('Raise Dead brings a downed ally straight back and is his biggest per-use payout', () => {
    const state = v040State({ 3: 'Morvane' });
    const battle = state.battle!;
    const m = findFighter(state, 'Morvane');
    const ally = battle.fighters.find((f) => f.playerId !== m.playerId)!;
    ally.alive = false;
    ally.hp = 0;
    ally.reviveAtSlot = battle.marker - 6;

    declareSkill(state, m, { kind: 'DECLARE_ACTION', skillId: 'RaiseDead', targetPlayerId: ally.playerId }, createRNG(1));

    expect(ally.alive).toBe(true);
    expect(ally.hp).toBeGreaterThan(0);
    expect(ally.reviveAtSlot).toBeNull();
    expect(state.scoreLog.find((e) => e.conditionId === 'morvane2')?.points).toBe(scorePoints('morvane2'));
  });

  it('Raise Dead refuses a living target', () => {
    const state = v040State({ 3: 'Morvane' });
    const m = findFighter(state, 'Morvane');
    const ally = state.battle!.fighters.find((f) => f.playerId !== m.playerId)!;
    expect(() =>
      declareSkill(state, m, { kind: 'DECLARE_ACTION', skillId: 'RaiseDead', targetPlayerId: ally.playerId }, createRNG(1))
    ).toThrow(/downed ally/);
  });

  it("Death Coil's HP surcharge is optional, is refused when lethal, and does not refund itself in souls", () => {
    const state = v040State({ 3: 'Morvane' });
    const m = findFighter(state, 'Morvane');
    m.souls = SOULS_PER_DEATH_COIL;
    m.hp = 3;
    expect(() =>
      declareSkill(state, m, { kind: 'DECLARE_ACTION', skillId: 'DeathCoil', payHp: true }, createRNG(1))
    ).toThrow(/would kill/);

    m.hp = 9;
    declareSkill(state, m, { kind: 'DECLARE_ACTION', skillId: 'DeathCoil', payHp: true }, createRNG(1));
    expect(m.hp).toBe(6);
    // The self-inflicted cost must not feed the soul engine, or the surcharge would partly pay for
    // itself. It spent SOULS_PER_DEATH_COIL and gained nothing back.
    expect(m.souls).toBe(0);

    const before = state.battle!.bossHp;
    resolveFighterPending(state, m, createRNG(1));
    expect(before - state.battle!.bossHp).toBe(20); // secondary tier, not primary 14
  });

  it('morvane3 wants him alive but only just', () => {
    const state = v040State({ 3: 'Morvane' });
    const m = findFighter(state, 'Morvane');
    m.hp = 3;
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.conditionId === 'morvane3')).toBe(true);

    const healthy = v040State({ 3: 'Morvane' });
    findFighter(healthy, 'Morvane').hp = 9;
    healthy.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(healthy);
    expect(healthy.scoreLog.some((e) => e.conditionId === 'morvane3')).toBe(false);
  });
});

describe('v0.4.0 end-to-end through the real clock walk', () => {
  // The unit tests above poke declareSkill directly. This one drives a whole battle through
  // playGame's generator so the new mechanics are exercised by the same loop the app runs —
  // which is where a marker rewind could plausibly break something (re-triggering pawns, an
  // infinite walk, a desynced queue) in a way that isolated calls never would.
  it('runs a full battle with Chrono rewinding the clock, and still terminates', async () => {
    const setup: NewGameSetup = {
      players: [
        { name: 'Chrono', kind: 'human' },
        { name: 'Bot 1', kind: 'bot', botLevel: 'easy' },
        { name: 'Bot 2', kind: 'bot', botLevel: 'easy' },
        { name: 'Bot 3', kind: 'bot', botLevel: 'easy' },
      ],
      difficulty: 'standard',
      ruleset: 'v0.4',
    };
    const seed = 4040;
    const rng = createRNG(seed);
    const state = newGame(setup, seed);
    const bots = setup.players.map((_, i) => createEasyBot(i, createRNG(seed + i + 1).next));

    let rewindsCast = 0;
    let markerWentUp = false;
    let lastMarker = 24;

    const gen = playGame(state, rng);
    let res = gen.next();
    let guard = 0;
    while (!res.done && guard++ < 20000) {
      const decision: PendingDecision = res.value;
      let choice: Choice;
      if (decision.playerId === 0 && decision.kind === 'CHOOSE_CHARACTER') {
        choice = { kind: 'CHOOSE_CHARACTER', charId: 'Chrono' };
      } else if (decision.playerId === 0 && decision.kind === 'DECLARE_ACTION') {
        const f = state.battle!.fighters.find((x) => x.playerId === 0)!;
        // Rewind the moment it is affordable; otherwise bank sand on the ⏱3 card.
        const canRewind = f.sand >= SAND_PER_REWIND;
        choice = { kind: 'DECLARE_ACTION', skillId: canRewind ? 'Rewind' : 'HourglassShard' };
        if (canRewind) rewindsCast++;
      } else {
        choice = await bots.find((b) => b.id === decision.playerId)!.decide(state, decision);
      }
      if (state.battle) {
        if (state.battle.marker > lastMarker) markerWentUp = true;
        lastMarker = state.battle.marker;
      }
      res = gen.next(choice);
    }

    expect(res.done).toBe(true);
    expect(state.gameOver).not.toBeNull();
    // The point of the exercise: Rewind actually fired, and the marker genuinely moved backwards up
    // the clock at some point — which no other card in the game can do.
    expect(rewindsCast).toBeGreaterThan(0);
    expect(markerWentUp).toBe(true);
    // And the clock never exceeded the runway it started with, in either direction.
    expect(state.battle!.marker).toBeGreaterThanOrEqual(-1);
    expect(state.battle!.marker).toBeLessThanOrEqual(24);
  });
});
