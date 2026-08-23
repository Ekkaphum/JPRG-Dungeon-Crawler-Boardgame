import { describe, expect, it } from 'vitest';
import {
  FRACTURE_GEM_DISCOUNT,
  FRACTURE_PCTS,
  applyDamageToBoss,
  claimFracture,
  createRNG,
  fractureGemsAreSpendable,
  fractureHpAt,
  owedFractures,
  prepareBattle,
  runClockBattle,
  settleUnclaimedFractures,
  type Choice,
  type GameState,
  type PendingDecision,
} from '@engine/index';
import { declareSkill } from '@engine/clock/skills';
import { ITEMS, buildItemDeck } from '@content/items';
import { createHardBot } from '@bots/hard';
import { fixedDraftState, fourEasyBotSetup, playFullGame } from './testUtils';

/** A fracture-ruleset battle with the lines actually drawn — prepareBattle only rolls them when it is
 *  handed an rng, which is what keeps the ~130 existing `prepareBattle(state)` calls unchanged. */
function fractureState(seed = 99): GameState {
  const state = fixedDraftState(seed);
  state.ruleset = 'fracture';
  prepareBattle(state, createRNG(seed));
  return state;
}

/** Damage the boss down to exactly `to`, attributed to `attackerId`. Goes through the real damage
 *  pipeline rather than assigning bossHp, because the crossing hook lives inside it. */
function hitBossTo(state: GameState, attackerId: number, to: number) {
  const battle = state.battle!;
  applyDamageToBoss(state, attackerId, battle.bossHp - to, { ignoresArmor: true, skillId: 'Slash' });
}

describe('fracture lines — setup', () => {
  it('draws one line per FRACTURE_PCTS, in track order, at floor(pct x max HP)', () => {
    const state = fractureState();
    const battle = state.battle!;
    expect(battle.fractures).toHaveLength(FRACTURE_PCTS.length);
    battle.fractures.forEach((line, i) => {
      expect(line.pct).toBe(FRACTURE_PCTS[i]);
      expect(line.hp).toBe(Math.floor(battle.bossHpMax * FRACTURE_PCTS[i]));
      expect(line.crossedBy).toBeNull();
      expect(line.taken).toBeNull();
    });
    // Track order: the 60% line has to sit above the 30% one, or "crossed in order" is meaningless.
    expect(battle.fractures[0].hp).toBeGreaterThan(battle.fractures[1].hp);
  });

  it('offers the item price less the discount as the cash alternative', () => {
    const state = fractureState();
    for (const line of state.battle!.fractures) {
      expect(line.gems).toBe(ITEMS[line.itemId].cost - FRACTURE_GEM_DISCOUNT);
    }
  });

  it('takes its bounties out of the same deck the camp market sells from', () => {
    const state = fractureState();
    // Stated as conservation rather than as a literal count: every card is either still in the
    // deck, on the market row, the face-up future card, or nailed to a fracture line. A separate
    // bounty pile would break this and make the camp rows free.
    const accountedFor =
      state.itemDeck.length + state.market.length + (state.futureCard === null ? 0 : 1) + state.battle!.fractures.length;
    expect(accountedFor).toBe(buildItemDeck().length);
    expect(state.battle!.fractures.length).toBe(2);
  });

  it('draws nothing in the rulesets that do not have the rule', () => {
    for (const ruleset of ['v0.3', 'v0.4'] as const) {
      const state = fixedDraftState(7);
      state.ruleset = ruleset;
      prepareBattle(state, createRNG(7));
      expect(state.battle!.fractures, ruleset).toHaveLength(0);
    }
  });
});

describe('fracture lines — crossing', () => {
  it('crosses on a hit that lands exactly on the line', () => {
    const state = fractureState();
    const line = state.battle!.fractures[0];
    hitBossTo(state, 1, line.hp);
    expect(line.crossedBy).toBe(1);
  });

  it('does not cross on a hit that stops one point above it', () => {
    const state = fractureState();
    const line = state.battle!.fractures[0];
    hitBossTo(state, 1, line.hp + 1);
    expect(line.crossedBy).toBeNull();
  });

  it('pays both lines to the same player when one hit clears both', () => {
    const state = fractureState();
    const [first, second] = state.battle!.fractures;
    hitBossTo(state, 2, second.hp - 1);
    expect(first.crossedBy).toBe(2);
    expect(second.crossedBy).toBe(2);
    expect(owedFractures(state, 2)).toHaveLength(2);
  });

  it('never re-arms a crossed line, even when the boss heals back above it', () => {
    const state = fractureState();
    const battle = state.battle!;
    const line = battle.fractures[0];
    hitBossTo(state, 0, line.hp);
    expect(line.crossedBy).toBe(0);
    // Aurelius's Golden Throne is exactly this: +8 HP, which can lift him back over a line he has
    // already been dragged under. If it re-armed, the correct play against him would be to stop
    // attacking and farm the heal.
    battle.bossHp = line.hp + 8;
    hitBossTo(state, 1, line.hp);
    expect(line.crossedBy).toBe(0);
    expect(owedFractures(state, 1)).toHaveLength(0);
  });

  it('credits whoever owned the damage, not whoever is being visited', () => {
    const state = fractureState();
    const line = state.battle!.fractures[0];
    // A trap detonation and a scheduled Multi Shot hit both go through applyDamageToBoss with their
    // owner's id while somebody else entirely is on the clock — that is the case this pins.
    hitBossTo(state, 3, line.hp);
    expect(line.crossedBy).toBe(3);
  });
});

describe('fracture lines — claiming', () => {
  it('hands over the item, and only that one', () => {
    const state = fractureState();
    const line = state.battle!.fractures[0];
    hitBossTo(state, 1, line.hp);
    claimFracture(state, 1, 0, 'item');
    expect(state.progress[1].items).toEqual([line.itemId]);
    expect(state.progress[1].gems).toBe(0);
    expect(line.taken).toBe('item');
  });

  it('pays gems instead when asked, at the item price less the discount', () => {
    const state = fractureState();
    const line = state.battle!.fractures[0];
    hitBossTo(state, 1, line.hp);
    claimFracture(state, 1, 0, 'gems');
    expect(state.progress[1].gems).toBe(ITEMS[line.itemId].cost - FRACTURE_GEM_DISCOUNT);
    expect(state.progress[1].items).toEqual([]);
  });

  it('puts a permanent onto the live fighter as well as the sheet', () => {
    const state = fractureState();
    const battle = state.battle!;
    const line = battle.fractures[0];
    // Forced rather than fished for out of a shuffle: every read site for permanents goes through
    // Fighter.itemPermanents, which prepareBattle copies once and nothing updates afterwards, so a
    // permanent won mid-battle would otherwise sit inert until the next boss.
    line.itemId = 'TimeAnchor';
    hitBossTo(state, 2, line.hp);
    claimFracture(state, 2, 0, 'item');
    expect(state.progress[2].permanents).toContain('TimeAnchor');
    expect(battle.fighters.find((f) => f.playerId === 2)!.itemPermanents).toContain('TimeAnchor');
    expect(state.progress[2].items).not.toContain('TimeAnchor');
  });

  it('refuses a line this player does not own, and refuses to pay one twice', () => {
    const state = fractureState();
    const line = state.battle!.fractures[0];
    hitBossTo(state, 1, line.hp);
    expect(() => claimFracture(state, 2, 0, 'item')).toThrow();
    claimFracture(state, 1, 0, 'item');
    expect(() => claimFracture(state, 1, 0, 'gems')).toThrow();
  });

  it('lets a card won this visit be spent on the same visit', () => {
    const state = fractureState();
    const battle = state.battle!;
    const line = battle.fractures[0];
    line.itemId = 'HerbPotion';
    const eric = battle.fighters.find((f) => f.playerId === 0)!;
    eric.hp = 4;
    hitBossTo(state, 0, line.hp);
    // The claim resolves before spendItems inside declareSkill — that ordering is the entire reason
    // the claim rides DECLARE_ACTION rather than being a decision of its own.
    declareSkill(
      state,
      eric,
      {
        kind: 'DECLARE_ACTION',
        fractureTakes: [{ index: 0, take: 'item' }],
        useItems: [{ itemId: 'HerbPotion', targetPlayerId: 0 }],
        skillId: 'Slash',
      },
      createRNG(3)
    );
    expect(eric.hp).toBe(4 + ITEMS.HerbPotion.value);
    expect(state.progress[0].items).toEqual([]);
  });

  it('settles anything still owed when the battle ends, as the item', () => {
    const state = fractureState();
    const [first, second] = state.battle!.fractures;
    // The 60% line is taken out of the way first, so this measures the 30% one alone — dropping
    // straight to 30% would cross both and hand player 3 two cards.
    hitBossTo(state, 0, first.hp);
    claimFracture(state, 0, 0, 'gems');
    const line = second;
    hitBossTo(state, 3, line.hp);
    settleUnclaimedFractures(state);
    expect(line.taken).toBe('item');
    expect(state.progress[3].items).toEqual([line.itemId]);
    // Idempotent: walk.ts calls it from two different battle exits.
    settleUnclaimedFractures(state);
    expect(state.progress[3].items).toHaveLength(1);
  });

  it('reports gems as dead on the last boss and spendable before it', () => {
    const state = fractureState();
    expect(fractureGemsAreSpendable(state)).toBe(true);
    state.bossIndex = state.bossQueue.length - 1;
    expect(fractureGemsAreSpendable(state)).toBe(false);
  });
});

describe('fracture lines — through the walk', () => {
  it('offers the claim on the crosser own next visit and nobody else', async () => {
    const state = fractureState(4242);
    const battle = state.battle!;
    const line = battle.fractures[0];
    hitBossTo(state, 1, line.hp);

    const gen = runClockBattle(state, createRNG(4242));
    let step = gen.next();
    let offeredTo: number[] = [];
    let guard = 0;
    while (!step.done && guard++ < 60) {
      const decision: PendingDecision = step.value;
      if (decision.kind === 'DECLARE_ACTION' && decision.options.fractureClaims.length > 0) {
        offeredTo.push(decision.playerId);
      }
      const bot = createHardBot(decision.playerId, createRNG(guard).next);
      const choice: Choice = await bot.decide(state, decision);
      step = gen.next(choice);
      if (line.taken !== null) break;
    }
    expect(offeredTo.every((id) => id === 1)).toBe(true);
    expect(line.taken).not.toBeNull();
  });

  it('runs a full fracture-ruleset game to a result with every seat botted', async () => {
    const final = await playFullGame(2026, { ...fourEasyBotSetup(), ruleset: 'fracture' });
    expect(final.gameOver).not.toBeNull();
    // Whatever the outcome, no bounty may be left hanging: every crossed line is settled one way or
    // the other by the time the battle it belongs to is over.
    for (const line of final.battle?.fractures ?? []) {
      if (line.crossedBy !== null) expect(line.taken).not.toBeNull();
    }
  });
});

describe('fractureHpAt', () => {
  it('floors, so the printed number is always reachable by whole damage', () => {
    expect(fractureHpAt(76, 0.6)).toBe(45);
    expect(fractureHpAt(76, 0.3)).toBe(22);
    expect(fractureHpAt(48, 0.6)).toBe(28);
    expect(fractureHpAt(88, 0.3)).toBe(26);
  });
});
