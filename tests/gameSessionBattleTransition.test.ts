import { describe, it, expect } from 'vitest';
import type { BattleState, GameState } from '@engine/index';
import { GameSession } from '@session/GameSession';
import { fixedDraftState } from './testUtils';

// Regression test for a real bug: defeating a non-final boss with the clock already at 0/1
// remaining grants floor(remaining/2) = 0 EXP to everyone, so runExpPlacement (game.ts) has no one
// to ask and never yields. The engine then falls straight through prepareBattle() for the *next*
// boss inside the same gen.next() call — by the time the session looks again, `state.battle`
// already points at the new fight, and the old one's tail (its BATTLE_END) would be skipped
// entirely if the session didn't drain it first. See GameSession.ts's revealNewEvents/drainBattle.

function emptyBattle(bossIndexBoss: 'Ragorath' | 'Somnivar'): BattleState {
  return {
    bossId: bossIndexBoss,
    bossHp: 0,
    bossHpMax: 65,
    armor: 0,
    rage: 0,
    marker: 24,
    fighters: [],
    bossSlot: 0,
    bossStackSeq: 0,
    traps: [],
    scheduledHits: [],
    weakPoint: null,
    partyBuff: null,
    guard: null,
    allyScoresForLuna: 0,
    finishedBy: null,
    finishedBySkill: null,
    nextStackSeq: 0,
    log: [{ t: 'BATTLE_START', bossId: bossIndexBoss, hp: 65 }],
    outcome: 'in_progress',
  };
}

describe('GameSession battle-transition pacing', () => {
  it('reveals a boss defeat even when the engine jumps straight into the next battle', async () => {
    const state: GameState = fixedDraftState();
    state.phase = 'CLOCK_RUN';
    state.bossQueue = ['Ragorath', 'Somnivar', 'Aurelius'];
    state.bossIndex = 0;
    // fixedDraftState() hardcodes every seat to 'bot' — flip one to 'human' so waitForBattleAck()
    // takes the controllable-Promise branch instead of the bot-table auto-ack timer, keeping this
    // test fast and deterministic.
    state.players[0].kind = 'human';

    const battleA = emptyBattle('Ragorath');
    state.battle = battleA;

    const session = new GameSession(
      {
        players: [
          { name: 'A', kind: 'human' },
          { name: 'B', kind: 'bot', botLevel: 'easy' },
          { name: 'C', kind: 'bot', botLevel: 'easy' },
          { name: 'D', kind: 'bot', botLevel: 'easy' },
        ],
        difficulty: 'standard',
      },
      1,
      state,
      0
    );

    // Reveal battleA's opening event — mirrors the session's very first tick.
    await (session as unknown as { revealNewEvents(): Promise<void> }).revealNewEvents();
    expect(session.battleResult).toBeNull();

    // Simulate one synchronous engine burst: the killing blow lands (clock at 1, so EXP = 0),
    // BATTLE_END is appended to battleA's log, *and* — because runExpPlacement had nobody to ask —
    // the engine already swapped in a brand-new battle object for the next boss, all before the
    // session gets to look again.
    battleA.log.push(
      { t: 'RESOLVE_ATTACK', playerId: 0, skillId: 'Slash', targetId: 'boss', dmg: 5, wasted: false },
      { t: 'BATTLE_END', outcome: 'boss_defeated', finishedBy: 0, expGranted: 0 }
    );
    const battleB = emptyBattle('Somnivar');
    session.state.bossIndex = 1;
    session.state.battle = battleB;

    // The single session tick that would follow that gen.next() call in GameSession.run().
    const revealPromise = (session as unknown as { revealNewEvents(): Promise<void> }).revealNewEvents();
    // Let the pending microtasks/timers (animSpeedMs=0, so no real delay) run.
    await Promise.resolve();
    await Promise.resolve();

    // The bug: without draining battleA first, battleResult would either stay null or — worse —
    // never appear at all, and displayBattle would already show battleB's fresh state.
    expect(session.battleResult).not.toBeNull();
    expect(session.battleResult!.outcome).toBe('boss_defeated');
    expect(session.battleResult!.bossId).toBe('Ragorath');
    expect(session.battleResult!.isLastBoss).toBe(false);
    // Genuinely blocked on the human's ack — hasn't jumped to the next boss yet.
    expect(session.displayBattle?.bossId).toBe('Ragorath');

    // Acknowledge it (as the player clicking "continue" would) to let the session move on.
    session.acknowledgeBattleResult();
    await revealPromise;

    // Now it should have switched cleanly over to the next battle.
    expect(session.displayBattle?.bossId).toBe('Somnivar');
  });
});
