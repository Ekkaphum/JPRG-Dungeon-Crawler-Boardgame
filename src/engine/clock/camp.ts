// v0.5 "camp" ruleset — the phase between boss battles.
//
// Three sub-phases, always in this order, because each one's budget is whatever the previous one
// left behind. That sequencing is the whole design: a player who buys three items has nothing left
// to upgrade with, and a player who banks everything for points fights the last boss with the kit
// they started with.
//
//   1. SHOP     — one seat at a time, fewest points first (character speed breaks ties)
//   2. UPGRADE  — simultaneous, GEMS_PER_UPGRADE per skill card flipped to Lv2
//   3. POINTS   — simultaneous, GEMS_PER_VP per victory point
//
// Gems do NOT carry to the next camp. Anything unspent at the end of step 3 is lost. This is the
// single most important rule in the file: it makes each camp a self-contained decision instead of a
// cross-battle optimisation problem, which is what keeps the phase to ~3 minutes rather than the
// 12-15 a savings-based economy costs (docs/DESIGN_VARIABLES.md §6.2).

import { BOSSES } from '@content/bosses3';
import { CHARACTERS, charSkills, type SkillId } from '@content/characters';
import { ITEMS, buildItemDeck } from '@content/items';
import { hasCamp } from '@content/rulesets';
import type { RNG } from '../rng';
import { currentTotalScore } from './damage';
import type { Choice, GameState, PendingDecision, PlayerId } from './types';

/** Gems for one skill card flipped to Lv2.
 *
 *  ⚠️ Sized by measurement, not by feel. The first pass used 6 with a ÷2 time bonus, which paid out
 *  ~28 gems a game and bought 3-4 upgrades against the EXP system's measured 1.83 — i.e. the camp
 *  silently doubled the game's progression. Hard win rate went 51.1% → 62.1%, and Kit's win share
 *  went 25.8% → 61.8%, because kit1 ("open a weak point") is uncapped and per-occurrence, so it
 *  scales directly with how early Sharp Shooting reaches Lv2. At 8 with a ÷3 time bonus the camp
 *  pays ~20 and buys ~2, which is the band the EXP system it replaces was tuned in. */
export const GEMS_PER_UPGRADE = 8;
/** Gems for one victory point. Deliberately the worst rate on offer — it is the sink for leftovers
 *  and the release valve for a player who is already ahead on power, not a strategy on its own. */
export const GEMS_PER_VP = 4;
/** Cards face up for sale. */
export const MARKET_SIZE = 4;
/** Divisor on the leftover clock. Same shape as the EXP payout players already know. */
export const GEMS_TIME_DIVISOR = 3;

/** Gems every player receives for a win: the boss's printed reward plus the leftover clock. Both
 *  halves are equal for everyone — the camp's asymmetry comes from what people *do* with the pile,
 *  not from who earned more. */
export function gemsForBattle(state: GameState): number {
  const battle = state.battle!;
  return BOSSES[battle.bossId].gemReward + Math.floor(Math.max(0, battle.marker) / GEMS_TIME_DIVISOR);
}

/** Shopping order: fewest points first, character speed breaking ties (lower goes first). Doing the
 *  catch-up, the turn order and the tie-break with one rule is the point — a simultaneous market
 *  would need a separate collision rule on top. */
export function shoppingOrder(state: GameState): PlayerId[] {
  return [...state.players]
    .map((p) => ({
      id: p.id,
      score: currentTotalScore(state, p.id) + state.progress[p.id].boughtVp,
      speed: CHARACTERS[p.charId].speed,
    }))
    .sort((a, b) => a.score - b.score || a.speed - b.speed || a.id - b.id)
    .map((x) => x.id);
}

function refillMarket(state: GameState): void {
  while (state.market.length < MARKET_SIZE) {
    if (state.futureCard !== null) {
      state.market.push(state.futureCard);
      state.futureCard = null;
    } else if (state.itemDeck.length > 0) {
      state.market.push(state.itemDeck.pop()!);
    } else break;
    if (state.futureCard === null && state.itemDeck.length > 0) state.futureCard = state.itemDeck.pop()!;
  }
  if (state.futureCard === null && state.itemDeck.length > 0) state.futureCard = state.itemDeck.pop()!;
}

/** Skills this player could still flip to Lv2. */
function upgradableSkills(state: GameState, playerId: PlayerId): SkillId[] {
  const prog = state.progress[playerId];
  return charSkills(prog.charId, state.ruleset).filter((id) => !prog.isLv2[id]);
}

export function initCamp(state: GameState, rng: RNG): void {
  if (!hasCamp(state.ruleset) || state.itemDeck.length > 0 || state.market.length > 0) return;
  state.itemDeck = rng.shuffle(buildItemDeck());
  refillMarket(state);
}

/** The full camp. Yields one decision at a time; the caller (driveGame / the sim) answers each. */
export function* runCamp(state: GameState, rng: RNG): Generator<PendingDecision, void, Choice> {
  state.phase = 'CAMP';
  initCamp(state, rng);

  const gained = gemsForBattle(state);
  for (const p of state.players) state.progress[p.id].gems += gained;

  // ── 1. shop ──
  for (const playerId of shoppingOrder(state)) {
    // Re-offered after every purchase so one seat may clear the row if it can afford to; a null
    // choice passes to the next seat.
    for (;;) {
      const prog = state.progress[playerId];
      const affordable = state.market.some((id) => ITEMS[id].cost <= prog.gems);
      if (!affordable) break;
      const choice = yield {
        kind: 'CAMP_BUY',
        playerId,
        gems: prog.gems,
        market: [...state.market],
        futureCard: state.futureCard,
      };
      if (choice.kind !== 'CAMP_BUY') throw new Error(`expected CAMP_BUY for player ${playerId}`);
      if (choice.itemId === null) break;
      const idx = state.market.indexOf(choice.itemId);
      const def = ITEMS[choice.itemId];
      // An illegal pick (not on the row, or unaffordable) is treated as passing rather than
      // throwing: a bot that mis-scores the market should lose its turn, not crash the game.
      if (idx < 0 || def.cost > prog.gems) break;
      state.market.splice(idx, 1);
      prog.gems -= def.cost;
      if (def.consumable) prog.items.push(choice.itemId);
      else prog.permanents.push(choice.itemId);
      refillMarket(state);
    }
  }

  // ── 2. upgrade (simultaneous at the table; sequential here only because the generator is) ──
  for (const p of state.players) {
    const prog = state.progress[p.id];
    const upgradable = upgradableSkills(state, p.id);
    if (upgradable.length === 0 || prog.gems < GEMS_PER_UPGRADE) continue;
    const choice = yield { kind: 'CAMP_UPGRADE', playerId: p.id, gems: prog.gems, upgradable };
    if (choice.kind !== 'CAMP_UPGRADE') throw new Error(`expected CAMP_UPGRADE for player ${p.id}`);
    for (const skillId of choice.skillIds) {
      if (prog.gems < GEMS_PER_UPGRADE) break;
      if (prog.isLv2[skillId]) continue;
      if (!charSkills(prog.charId, state.ruleset).includes(skillId)) continue;
      prog.gems -= GEMS_PER_UPGRADE;
      prog.isLv2[skillId] = true;
      // Keep the EXP display honest: a card bought to Lv2 reads as a full card, not a blank one.
      prog.expOnCard[skillId] = 3;
    }
  }

  // ── 3. points ──
  for (const p of state.players) {
    const prog = state.progress[p.id];
    if (prog.gems < GEMS_PER_VP) {
      prog.gems = 0;
      continue;
    }
    const choice = yield { kind: 'CAMP_VP', playerId: p.id, gems: prog.gems };
    if (choice.kind !== 'CAMP_VP') throw new Error(`expected CAMP_VP for player ${p.id}`);
    const spend = Math.min(Math.max(0, choice.gemsSpent), prog.gems);
    prog.boughtVp += Math.floor(spend / GEMS_PER_VP);
    // Everything left is lost — see the header. Done here rather than in a separate sweep so there
    // is exactly one place where a gem can survive a camp, and it doesn't.
    prog.gems = 0;
  }
}
