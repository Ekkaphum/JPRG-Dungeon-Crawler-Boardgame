import { CHARACTERS, SKILLS } from '@content/characters';
import { ITEMS, type ItemId } from '@content/items';
import { GEMS_PER_UPGRADE, GEMS_PER_VP } from '@engine/clock/camp';
import type { Choice, GameState, PendingDecision } from '@engine/index';

export function chooseCharacterDefault(decision: Extract<PendingDecision, { kind: 'CHOOSE_CHARACTER' }>, rand: () => number): Choice {
  const charId = decision.available[Math.floor(rand() * decision.available.length)];
  return { kind: 'CHOOSE_CHARACTER', charId };
}

/** Bots always spend every banked EXP token immediately, preferring to flip their first
 *  not-yet-Lv2 skill (attack skills first) rather than spreading thin. */
export function placeExpDefault(state: GameState, decision: Extract<PendingDecision, { kind: 'PLACE_EXP' }>): Choice {
  const charDef = CHARACTERS[state.players.find((p) => p.id === decision.playerId)!.charId];
  let remaining = decision.bankedExp;
  const allocations: { skillId: (typeof charDef.skills)[number]; count: number }[] = [];
  const order = [...charDef.skills].sort((a, b) => (decision.expOnCard[a] ?? 0) - (decision.expOnCard[b] ?? 0)).reverse();
  for (const skillId of order) {
    if (remaining <= 0) break;
    const capacity = 3 - (decision.expOnCard[skillId] ?? 0);
    if (capacity <= 0) continue;
    const put = Math.min(capacity, remaining);
    allocations.push({ skillId, count: put });
    remaining -= put;
  }
  return { kind: 'PLACE_EXP', allocations };
}

// ─────────────────────────── v0.5 camp ───────────────────────────
//
// ⚠️ Read this before trusting any v0.5 sim number. The bots price the camp with the static table
// below, not by simulating what an item would actually do — the same blind spot BALANCE_NOTES
// already documents for sand/shadow/souls. A v0.5 run therefore measures "what happens when a party
// spends gems roughly sensibly", which is enough to catch a runaway economy or a dead phase, and is
// NOT a measurement of whether any individual item is correctly priced.


/** Rough desirability per item, independent of board state. Tuned only so the bot does not buy
 *  purely by price; anything finer would be inventing a competence the bot does not have. */
const ITEM_VALUE: Record<ItemId, number> = {
  HerbPotion: 5, HolyWater: 3, PowerElixir: 6, SwiftDraught: 5, IronTonic: 4, ArmorSpike: 4,
  GreaterPotion: 9, BulwarkCharm: 7, Grapnel: 7, GreaterSwift: 8, VanguardBanner: 3, VenomCoating: 8,
  PhoenixDraught: 9, SmokeBomb: 9, WeaknessLens: 12, RevivalCharm: 7, TimeAnchor: 6,
};

export function campBuyDefault(
  decision: Extract<PendingDecision, { kind: 'CAMP_BUY' }>
): Extract<Choice, { kind: 'CAMP_BUY' }> {
  const affordable = decision.market.filter((id) => ITEMS[id].cost <= decision.gems);
  if (affordable.length === 0) return { kind: 'CAMP_BUY', itemId: null };
  // Keep enough back for one upgrade when an upgrade is still within reach — otherwise the bot
  // spends the whole camp on trinkets and the Lv2 system silently stops existing.
  const reserve = decision.gems >= GEMS_PER_UPGRADE ? GEMS_PER_UPGRADE : 0;
  const withinBudget = affordable.filter((id) => ITEMS[id].cost <= decision.gems - reserve);
  const pool = withinBudget.length > 0 ? withinBudget : [];
  if (pool.length === 0) return { kind: 'CAMP_BUY', itemId: null };
  const best = pool.reduce((a, b) =>
    ITEM_VALUE[b] / ITEMS[b].cost > ITEM_VALUE[a] / ITEMS[a].cost ? b : a
  );
  return { kind: 'CAMP_BUY', itemId: best };
}

export function campUpgradeDefault(
  decision: Extract<PendingDecision, { kind: 'CAMP_UPGRADE' }>
): Extract<Choice, { kind: 'CAMP_UPGRADE' }> {
  // Same ranking the declare heuristic uses — damage per ⏱ at Lv2 — so the bot upgrades the card it
  // will actually lean on rather than the first in the list.
  const ranked = [...decision.upgradable].sort((a, b) => {
    const va = (SKILLS[b].lv2.primary ?? 0) / Math.max(1, SKILLS[b].lv2.time);
    const vb = (SKILLS[a].lv2.primary ?? 0) / Math.max(1, SKILLS[a].lv2.time);
    return va - vb;
  });
  const affordable = Math.floor(decision.gems / GEMS_PER_UPGRADE);
  return { kind: 'CAMP_UPGRADE', skillIds: ranked.slice(0, affordable) };
}

export function campVpDefault(
  decision: Extract<PendingDecision, { kind: 'CAMP_VP' }>
): Extract<Choice, { kind: 'CAMP_VP' }> {
  // Leftovers are lost at the end of the camp, so converting everything is strictly correct here.
  return { kind: 'CAMP_VP', gemsSpent: Math.floor(decision.gems / GEMS_PER_VP) * GEMS_PER_VP };
}

/** Items the bot will spend on this visit, as the free action folded into DECLARE_ACTION. Kept
 *  deliberately simple: heal when hurt, otherwise put an offensive consumable on this swing. */
export function autoUseItems(
  state: GameState,
  playerId: number
): { itemId: ItemId; targetPlayerId?: number }[] {
  const prog = state.progress[playerId];
  if (!prog || prog.items.length === 0) return [];
  const battle = state.battle;
  const me = battle?.fighters.find((f) => f.playerId === playerId);
  if (!me) return [];
  const uses: { itemId: ItemId; targetPlayerId?: number }[] = [];

  if (me.hp * 2 < me.maxHp) {
    const potion = prog.items.find((id) => ITEMS[id].kind === 'heal');
    if (potion) uses.push({ itemId: potion, targetPlayerId: playerId });
  }
  if (me.ailments.length > 0) {
    const cure = prog.items.find((id) => ITEMS[id].kind === 'cleanse');
    if (cure) uses.push({ itemId: cure, targetPlayerId: playerId });
  }
  const offensive = prog.items.find((id) => {
    const k = ITEMS[id].kind;
    return k === 'atkBuff' || k === 'pierce' || k === 'poisonSlots';
  });
  if (offensive) uses.push({ itemId: offensive });
  return uses;
}
