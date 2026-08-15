import { describe, it, expect } from 'vitest';
import {
  prepareBattle,
  declareSkill,
  resolveFighterPending,
  createRNG,
  onPlayerDealtDamage,
  onWeakPointOpened,
  onHealResolved,
  onBattleEndScoring,
  dealDamageToFighterFromBoss,
} from '@engine/index';
import { scorePoints } from '@content/characters';
import { fixedDraftState, setPlayerCharacter } from './testUtils';

// Dax and Mira (2026-08-11) make the draft meaningful with a 4-player table by giving it 6
// characters to pick from — see the CharId comment in characters.ts. Both intentionally reuse only
// skill kinds the engine already treats generically, so most of this coverage is really regression
// coverage for the two real attribution bugs that adding them exposed: onWeakPointOpened and
// onHealResolved hardcoded which condition to credit ('kit1'/'luna1') instead of looking up the
// actual character, and the counter-riposte code hardcoded skillId: 'CounterAttack' regardless of
// which buffCounter skill actually fired.

function findFighter(state: ReturnType<typeof fixedDraftState>, playerId: number) {
  return state.battle!.fighters.find((f) => f.playerId === playerId)!;
}

describe('Dax score conditions', () => {
  it('dax1: onWeakPointOpened credits Dax, not kit1', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 0, 'Dax'); // player 0 was Eric
    prepareBattle(state);
    const dax = findFighter(state, 0);

    onWeakPointOpened(state, dax.playerId);

    expect(state.scoreLog.some((e) => e.conditionId === 'kit1')).toBe(false);
    const entry = state.scoreLog.find((e) => e.conditionId === 'dax1');
    expect(entry?.playerId).toBe(dax.playerId);
    expect(entry?.points).toBe(scorePoints('dax1'));
  });

  it("kit1 still fires for Kit — the character lookup didn't break the original path", () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const kit = findFighter(state, 1); // player 1 is Kit in fixedDraftState
    onWeakPointOpened(state, kit.playerId);
    expect(state.scoreLog.find((e) => e.conditionId === 'kit1')?.playerId).toBe(kit.playerId);
  });

  it('dax2: a Riposte counter-strike is attributed to dax2, not silently dropped', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 0, 'Dax');
    prepareBattle(state);
    const dax = findFighter(state, 0);
    declareSkill(state, dax, { kind: 'DECLARE_ACTION', skillId: 'Riposte' }, createRNG(1));
    expect(dax.shield?.kind).toBe('counter');

    dealDamageToFighterFromBoss(state, dax, 10);

    // The riposte must log as 'Riposte', not the old hardcoded 'CounterAttack' — otherwise this
    // condition (which checks skillId === 'Riposte') would be permanently unreachable.
    const riposteLog = state.battle!.log.find((e) => e.t === 'RESOLVE_ATTACK' && e.skillId === 'Riposte' && e.targetId === 'boss');
    expect(riposteLog).toBeDefined();
    expect(state.battle!.log.some((e) => e.t === 'RESOLVE_ATTACK' && e.skillId === 'CounterAttack')).toBe(false);

    const scored = state.scoreLog.find((e) => e.conditionId === 'dax2');
    expect(scored?.points).toBe(scorePoints('dax2'));
  });

  it("Eric's Counter Attack still logs as 'CounterAttack' — the lookup resolves to his own skill", () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const matt = findFighter(state, 0);
    declareSkill(state, matt, { kind: 'DECLARE_ACTION', skillId: 'CounterAttack' }, createRNG(1));
    dealDamageToFighterFromBoss(state, matt, 10);
    expect(state.battle!.log.some((e) => e.t === 'RESOLVE_ATTACK' && e.skillId === 'CounterAttack')).toBe(true);
  });

  it('dax3: ends the battle above half HP', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 0, 'Dax');
    prepareBattle(state);
    const dax = findFighter(state, 0);
    dax.hp = Math.floor(dax.maxHp / 2) + 1;
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.playerId === dax.playerId && e.conditionId === 'dax3')).toBe(true);
  });

  it('dax3 does not fire at exactly half HP or below', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 0, 'Dax');
    prepareBattle(state);
    const dax = findFighter(state, 0);
    dax.hp = Math.floor(dax.maxHp / 2);
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.playerId === dax.playerId && e.conditionId === 'dax3')).toBe(false);
  });
});

describe('Mira score conditions', () => {
  it('mira1: onHealResolved credits Mira, not luna1', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 3, 'Mira'); // player 3 was Luna
    prepareBattle(state);
    const mira = findFighter(state, 3);

    onHealResolved(state, mira.playerId, mira.playerId, 1);

    expect(state.scoreLog.some((e) => e.conditionId === 'luna1')).toBe(false);
    const entry = state.scoreLog.find((e) => e.conditionId === 'mira1');
    expect(entry?.playerId).toBe(mira.playerId);
    expect(entry?.points).toBe(scorePoints('mira1'));
  });

  it("luna1 still fires for Luna — the character lookup didn't break the original path", () => {
    const state = fixedDraftState();
    prepareBattle(state);
    const luna = findFighter(state, 3);
    const ally = findFighter(state, 0);
    onHealResolved(state, luna.playerId, ally.playerId, 1);
    expect(state.scoreLog.find((e) => e.conditionId === 'luna1')?.playerId).toBe(luna.playerId);
  });

  it('mira2: Frost Bolt dealing >10 damage', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 3, 'Mira');
    prepareBattle(state);
    const mira = findFighter(state, 3);

    onPlayerDealtDamage(state, mira.playerId, 'FrostBolt', 11);
    expect(state.scoreLog.find((e) => e.conditionId === 'mira2')?.points).toBe(scorePoints('mira2'));
  });

  it('mira2 does not fire at exactly 10 damage or for a different skill', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 3, 'Mira');
    prepareBattle(state);
    const mira = findFighter(state, 3);
    onPlayerDealtDamage(state, mira.playerId, 'FrostBolt', 10);
    expect(state.scoreLog.some((e) => e.conditionId === 'mira2')).toBe(false);
  });

  it('mira3: never died this battle', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 3, 'Mira');
    prepareBattle(state);
    const mira = findFighter(state, 3);
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.playerId === mira.playerId && e.conditionId === 'mira3')).toBe(true);
  });

  it('mira3 does not fire if Mira died and was revived (dying at all disqualifies, same rule as vera3)', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 3, 'Mira');
    prepareBattle(state);
    const mira = findFighter(state, 3);
    mira.everDiedThisBattle = true;
    state.battle!.outcome = 'boss_defeated';
    onBattleEndScoring(state);
    expect(state.scoreLog.some((e) => e.playerId === mira.playerId && e.conditionId === 'mira3')).toBe(false);
  });
});

describe('Dax/Mira declare and resolve through the generic skill-kind paths', () => {
  it("Flurry (attack, multi-hit) deals 3 separate hits, same shape as Kit's Twin Shot", () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 0, 'Dax');
    prepareBattle(state);
    const dax = findFighter(state, 0);
    declareSkill(state, dax, { kind: 'DECLARE_ACTION', skillId: 'Flurry' }, createRNG(1));
    const bossHpBefore = state.battle!.bossHp;
    resolveFighterPending(state, dax, createRNG(1));
    const hits = state.battle!.log.filter((e) => e.t === 'RESOLVE_ATTACK' && e.skillId === 'Flurry' && !e.wasted);
    expect(hits).toHaveLength(3);
    expect(state.battle!.bossHp).toBeLessThan(bossHpBefore);
  });

  it('Focus (attackRoll) opens the weak point and credits dax1 on a successful roll', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 0, 'Dax');
    prepareBattle(state);
    const dax = findFighter(state, 0);
    declareSkill(state, dax, { kind: 'DECLARE_ACTION', skillId: 'Focus' }, createRNG(1));
    resolveFighterPending(state, dax, { ...createRNG(1), int: () => 6 } as ReturnType<typeof createRNG>);
    expect(state.battle!.weakPointActive).toBe(true);
    expect(state.scoreLog.find((e) => e.conditionId === 'dax1')?.playerId).toBe(dax.playerId);
  });

  it('FrostBolt (attackMana) spends mana up front like Fireball', () => {
    const state = fixedDraftState();
    setPlayerCharacter(state, 3, 'Mira');
    prepareBattle(state);
    const mira = findFighter(state, 3);
    mira.mana = 2;
    declareSkill(state, mira, { kind: 'DECLARE_ACTION', skillId: 'FrostBolt', manaSpent: 2 }, createRNG(1));
    expect(mira.mana).toBe(0);
  });
});
