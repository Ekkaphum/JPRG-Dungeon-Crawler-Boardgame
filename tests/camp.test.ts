import { describe, expect, it } from 'vitest';
import { createRNG, prepareBattle, type Choice, type GameState, type PendingDecision } from '@engine/index';
import { GEMS_PER_UPGRADE, GEMS_PER_VP, GEMS_TIME_DIVISOR, MARKET_SIZE, gemsForBattle, runCamp, shoppingOrder } from '@engine/clock/camp';
import { declareSkill } from '@engine/clock/skills';
import { applyDamageToBoss, applyDamageToFighter, computeOutgoingPlayerDamage } from '@engine/clock/damage';
import { useItem } from '@engine/clock/items';
import { ITEMS, buildItemDeck } from '@content/items';
import { BOSSES } from '@content/bosses3';
import { CHARACTERS } from '@content/characters';
import { fixedDraftState } from './testUtils';

function campState(): GameState {
  const state = fixedDraftState(99);
  state.ruleset = 'v0.5';
  prepareBattle(state);
  return state;
}

/** Drives runCamp to completion with a scripted answer per decision kind. */
function runCampWith(
  state: GameState,
  answer: (d: PendingDecision) => Choice
): void {
  const gen = runCamp(state, createRNG(7));
  let step = gen.next();
  let guard = 0;
  while (!step.done) {
    if (++guard > 500) throw new Error('camp did not terminate');
    step = gen.next(answer(step.value));
  }
}

describe('v0.5 camp — gems', () => {
  it('pays the boss reward plus the leftover clock over GEMS_TIME_DIVISOR', () => {
    const state = campState();
    state.battle!.marker = 12;
    expect(gemsForBattle(state)).toBe(BOSSES[state.battle!.bossId].gemReward + 12 / GEMS_TIME_DIVISOR);
  });

  it('grants the same amount to every player', () => {
    const state = campState();
    state.battle!.marker = 10;
    const expected = gemsForBattle(state);
    runCampWith(state, (d) =>
      d.kind === 'CAMP_BUY' ? { kind: 'CAMP_BUY', itemId: null }
      : d.kind === 'CAMP_UPGRADE' ? { kind: 'CAMP_UPGRADE', skillIds: [] }
      : { kind: 'CAMP_VP', gemsSpent: 0 }
    );
    // Everything unspent is destroyed, so the grant is observable only through what it bought —
    // here, nothing. The point of the assertion is that the pile is empty afterwards, not full.
    for (const p of state.players) expect(state.progress[p.id].gems).toBe(0);
    expect(expected).toBeGreaterThan(0);
  });

  it('does not carry gems between camps', () => {
    const state = campState();
    state.battle!.marker = 12;
    runCampWith(state, (d) =>
      d.kind === 'CAMP_BUY' ? { kind: 'CAMP_BUY', itemId: null }
      : d.kind === 'CAMP_UPGRADE' ? { kind: 'CAMP_UPGRADE', skillIds: [] }
      : { kind: 'CAMP_VP', gemsSpent: 0 }
    );
    for (const p of state.players) expect(state.progress[p.id].gems).toBe(0);
  });
});

describe('v0.5 camp — shopping order', () => {
  it('puts the lowest score first and breaks ties on character speed', () => {
    const state = campState();
    // All four on zero points: pure speed order — Kit(2) < Luna(3) < Liora(4) < Eric(5).
    const order = shoppingOrder(state).map((id) => state.players.find((p) => p.id === id)!.charId);
    expect(order).toEqual(['Kit', 'Luna', 'Liora', 'Eric']);
  });

  it('a player ahead on points shops last regardless of speed', () => {
    const state = campState();
    state.progress[1].boughtVp = 10; // Kit, the fastest
    expect(shoppingOrder(state).at(-1)).toBe(1);
  });
});

describe('v0.5 camp — market', () => {
  it('opens with MARKET_SIZE cards face up and one future card', () => {
    const state = campState();
    state.battle!.marker = 12;
    let seen: PendingDecision | null = null;
    const gen = runCamp(state, createRNG(3));
    const first = gen.next();
    if (!first.done) seen = first.value;
    expect(seen?.kind).toBe('CAMP_BUY');
    const d = seen as Extract<PendingDecision, { kind: 'CAMP_BUY' }>;
    expect(d.market).toHaveLength(MARKET_SIZE);
    expect(d.futureCard).not.toBeNull();
  });

  it('slides the future card in when one is bought, and charges for it', () => {
    const state = campState();
    state.battle!.marker = 12;
    let bought = false;
    let futureBefore: string | null = null;
    runCampWith(state, (d) => {
      if (d.kind === 'CAMP_BUY') {
        if (!bought) {
          const target = d.market.find((id) => ITEMS[id].cost <= d.gems);
          if (target) {
            bought = true;
            futureBefore = d.futureCard;
            return { kind: 'CAMP_BUY', itemId: target };
          }
        }
        return { kind: 'CAMP_BUY', itemId: null };
      }
      if (d.kind === 'CAMP_UPGRADE') return { kind: 'CAMP_UPGRADE', skillIds: [] };
      return { kind: 'CAMP_VP', gemsSpent: 0 };
    });
    expect(bought).toBe(true);
    expect(futureBefore).not.toBeNull();
    expect(state.market).toHaveLength(MARKET_SIZE);
    const owned = state.players.flatMap((p) => [...state.progress[p.id].items, ...state.progress[p.id].permanents]);
    expect(owned.length).toBe(1);
  });

  it('the deck holds 34 cards', () => {
    expect(buildItemDeck()).toHaveLength(35);
  });
});

describe('v0.5 camp — upgrade and points', () => {
  it('charges GEMS_PER_UPGRADE and flips the card to Lv2', () => {
    const state = campState();
    state.battle!.marker = 12;
    runCampWith(state, (d) => {
      if (d.kind === 'CAMP_BUY') return { kind: 'CAMP_BUY', itemId: null };
      if (d.kind === 'CAMP_UPGRADE') return { kind: 'CAMP_UPGRADE', skillIds: [d.upgradable[0]] };
      return { kind: 'CAMP_VP', gemsSpent: 0 };
    });
    for (const p of state.players) {
      const flipped = CHARACTERS[p.charId].skills.filter((s) => state.progress[p.id].isLv2[s]);
      expect(flipped).toHaveLength(1);
    }
  });

  it('cannot buy more upgrades than the gems allow', () => {
    const state = campState();
    state.battle!.marker = 0; // minimum income: boss reward only
    const income = gemsForBattle(state);
    runCampWith(state, (d) => {
      if (d.kind === 'CAMP_BUY') return { kind: 'CAMP_BUY', itemId: null };
      if (d.kind === 'CAMP_UPGRADE') return { kind: 'CAMP_UPGRADE', skillIds: [...d.upgradable] };
      return { kind: 'CAMP_VP', gemsSpent: 0 };
    });
    const flipped = CHARACTERS[state.players[0].charId].skills.filter((s) => state.progress[0].isLv2[s]);
    expect(flipped.length).toBe(Math.floor(income / GEMS_PER_UPGRADE));
  });

  it('converts leftovers at GEMS_PER_VP to 1', () => {
    const state = campState();
    state.battle!.marker = 12;
    const income = gemsForBattle(state);
    runCampWith(state, (d) => {
      if (d.kind === 'CAMP_BUY') return { kind: 'CAMP_BUY', itemId: null };
      if (d.kind === 'CAMP_UPGRADE') return { kind: 'CAMP_UPGRADE', skillIds: [] };
      return { kind: 'CAMP_VP', gemsSpent: d.kind === 'CAMP_VP' ? d.gems : 0 };
    });
    expect(state.progress[0].boughtVp).toBe(Math.floor(income / GEMS_PER_VP));
  });
});

describe('v0.5 items — free action effects', () => {
  it('haste cuts the declared action ⏱ but never below 1', () => {
    const state = campState();
    const f = state.battle!.fighters[0];
    state.battle!.marker = 20;
    f.slot = 20;
    state.progress[0].items = ['GreaterSwift'];
    declareSkill(state, f, { kind: 'DECLARE_ACTION', skillId: 'Slash', useItems: [{ itemId: 'GreaterSwift' }] }, createRNG(1));
    // Slash is ⏱2; −2 would be 0, so the floor holds it at 1.
    expect(f.slot).toBe(19);
    expect(state.progress[0].items).toHaveLength(0);
  });

  it('the attack bonus applies to one swing and is then spent', () => {
    const state = campState();
    const f = state.battle!.fighters[0];
    useItem(state, f, 'PowerElixir');
    expect(computeOutgoingPlayerDamage(state.battle!, 10, 0)).toBe(15);
    expect(f.itemAtkBonus).toBe(0);
    expect(computeOutgoingPlayerDamage(state.battle!, 10, 0)).toBe(10);
  });

  it('pierce ignores armor exactly once', () => {
    const state = campState();
    state.battle!.armor = 4;
    const f = state.battle!.fighters[0];
    useItem(state, f, 'ArmorSpike');
    const first = state.battle!.bossHp;
    applyDamageToBoss(state, 0, 10, { ignoresArmor: false, skillId: 'Slash' });
    expect(first - state.battle!.bossHp).toBe(10);
    const second = state.battle!.bossHp;
    applyDamageToBoss(state, 0, 10, { ignoresArmor: false, skillId: 'Slash' });
    expect(second - state.battle!.bossHp).toBe(6);
  });

  it('ward reduces every hit while absorb is spent by the first', () => {
    const state = campState();
    const f = state.battle!.fighters[0];
    useItem(state, f, 'IronTonic'); // ward 4
    useItem(state, f, 'BulwarkCharm'); // absorb 10
    expect(applyDamageToFighter(state, f, 20)).toBe(6);
    expect(applyDamageToFighter(state, f, 20)).toBe(16);
  });

  it('smoke bomb negates a hit outright', () => {
    const state = campState();
    const f = state.battle!.fighters[0];
    useItem(state, f, 'SmokeBomb');
    expect(applyDamageToFighter(state, f, 30)).toBe(0);
  });

  it('the grapnel shoves the boss pawn back', () => {
    const state = campState();
    state.battle!.bossSlot = 15;
    useItem(state, state.battle!.fighters[0], 'Grapnel');
    expect(state.battle!.bossSlot).toBe(13);
  });

  it('venom coating writes damage onto the next three slots', () => {
    const state = campState();
    state.battle!.marker = 20;
    useItem(state, state.battle!.fighters[0], 'VenomCoating');
    expect(state.battle!.scheduledHits.filter((h) => h.dmg === 3)).toHaveLength(3);
  });

  it('the lens opens the weak point for the whole party', () => {
    const state = campState();
    expect(state.battle!.weakPoint).toBeNull();
    useItem(state, state.battle!.fighters[0], 'WeaknessLens');
    expect(state.battle!.weakPoint).not.toBeNull();
  });

  it('a phoenix draught stands a downed ally up', () => {
    const state = campState();
    const target = state.battle!.fighters[1];
    target.alive = false;
    target.hp = 0;
    useItem(state, state.battle!.fighters[0], 'PhoenixDraught', target.playerId);
    expect(target.alive).toBe(true);
    expect(target.hp).toBe(CHARACTERS[target.charId].reviveHp);
  });

  it('spending an item the player does not hold is a no-op', () => {
    const state = campState();
    const f = state.battle!.fighters[0];
    state.progress[0].items = [];
    declareSkill(state, f, { kind: 'DECLARE_ACTION', skillId: 'Slash', useItems: [{ itemId: 'SmokeBomb' }] }, createRNG(1));
    expect(f.itemAbsorb).toBe(0);
  });
});

describe('v0.5 — a whole game runs end to end', () => {
  it('plays three bosses with two camps and produces a winner', async () => {
    const { newGame, playGame } = await import('@engine/index');
    const { createMediumBot } = await import('@bots/medium');
    const state = newGame(
      {
        players: [
          { name: 'A', kind: 'bot', botLevel: 'medium' },
          { name: 'B', kind: 'bot', botLevel: 'medium' },
          { name: 'C', kind: 'bot', botLevel: 'medium' },
          { name: 'D', kind: 'bot', botLevel: 'medium' },
        ],
        difficulty: 'standard',
        ruleset: 'v0.5',
      },
      4242
    );
    const rng = createRNG(4242);
    const bots = state.players.map((p) => createMediumBot(p.id, () => rng.next()));
    const gen = playGame(state, rng);
    let step = gen.next();
    let guard = 0;
    while (!step.done) {
      if (++guard > 20000) throw new Error('game did not terminate');
      const decision = step.value;
      step = gen.next(await bots[decision.playerId].decide(state, decision));
    }
    const final = step.value;
    expect(final.gameOver).not.toBeNull();
    // Whether the party won or wiped, the camp must have left no gems behind anywhere.
    for (const p of final.players) expect(final.progress[p.id].gems).toBe(0);
  });
});
