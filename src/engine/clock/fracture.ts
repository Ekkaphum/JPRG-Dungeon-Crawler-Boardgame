// v0.4.6 "fracture" ruleset — two marks on the boss's HP track that pay a bounty to whoever's
// damage takes the boss past them.
//
// The whole rule, in the order it happens at the table:
//
//   1. At the start of every battle two item cards are drawn off the camp deck and laid FACE UP
//      next to the boss, one against each line. Everybody can see both bounties from turn one —
//      that is the point of the rule, not a convenience. A hidden reward is a lottery; a visible
//      one is a target the whole table can plan a route to.
//   2. The lines sit at FRACTURE_PCTS of the boss's starting HP. A hit that brings boss HP *to or
//      below* a line crosses it, and the line is owed to whoever owned that damage.
//   3. On their next visit the owner takes either the item, or gems equal to its shop price minus
//      FRACTURE_GEM_DISCOUNT.
//
// Three rulings that are not obvious and that everything downstream depends on:
//
// **A crossed line never re-arms.** Aurelius heals 8 HP on Golden Throne and can climb back over a
// line he has already been dragged under. If lines re-armed he would be a bounty farm, and the
// party's correct play against him would be to stop attacking and wait for the heal. Crossed is
// crossed, permanently — which is also how a physical board would work: you slide the marker down
// the track and take the card, and there is no card left to take twice.
//
// **One hit can cross both lines, and pays both.** A Meteor that takes Aurelius from 54 to 20
// clears 52 and 26 in one swing. Splitting the payout would need a rule for *which* other player
// gets the second one, and there is no honest answer — nobody else did anything. It is a real
// concentration risk, and it is measured rather than assumed; see docs/BALANCE_NOTES.md.
//
// **The claim resolves on the owner's next visit, not at the instant of the crossing.** This is an
// engine-shape constraint turned into a rule rather than fought: damage resolves deep inside
// non-generator call stacks (a trap firing at a marker tick, a boss move, a scheduled Multi Shot
// hit), and yielding a decision from there would mean threading a generator through the entire
// damage pipeline. Folding the claim into the DECLARE_ACTION the player is about to make anyway is
// the same trick items already use, and it costs almost nothing in practice: a player's own attack
// resolves at the *top* of their visit, so the overwhelmingly common case — you swung, you crossed
// the line — offers the claim in that very same visit, with the item usable on the same turn.

import { ITEMS, type ItemId } from '@content/items';
import { hasFractures } from '@content/rulesets';
import type { FractureLine, GameState, PlayerId } from './types';

/** Where the lines sit, as a fraction of the boss's starting HP. Two, not three: each line closes a
 *  ~30% band of the fight, which is long enough that the table can see one coming and plan around
 *  it. Three lines at 75/50/25 would fire one about every eight slots and turn the bounty from a
 *  landmark into background income — and each extra line multiplies the concentration risk in the
 *  header note rather than diluting it. */
export const FRACTURE_PCTS = [0.6, 0.3] as const;

/** Gems offered instead of the item, as a discount off its shop price: 3 → 2, 5 → 4, 8 → 7.
 *
 *  The −1 is doing real work. At parity the choice would be free and the item would win only when
 *  it happened to be useful, so cash would be the strictly-better default for anyone who did not
 *  need that exact card. One gem is small enough that a card you actually want is still worth
 *  taking, and large enough that the choice costs something either way. */
export const FRACTURE_GEM_DISCOUNT = 1;

/** Boss HP at or below which a line is crossed. Floor rather than round, so the printed number is
 *  always reachable by whole damage and never sits half a point above where the track is marked. */
export function fractureHpAt(bossHpMax: number, pct: number): number {
  return Math.floor(bossHpMax * pct);
}

/** Draws this battle's bounties off the shared camp deck. The same deck the market sells from, on
 *  purpose: there is one supply of items in the world, and six cards pulled out of it over a game
 *  is a real cost paid by the camp rows rather than a free second economy bolted on beside them.
 *
 *  A short deck simply yields fewer lines — the returned array is what exists, and every read site
 *  iterates it rather than assuming two. */
export function rollFractures(state: GameState): FractureLine[] {
  if (!hasFractures(state.ruleset) || !state.battle) return [];
  const lines: FractureLine[] = [];
  for (const pct of FRACTURE_PCTS) {
    const itemId = state.itemDeck.pop();
    if (itemId === undefined) break;
    lines.push({
      pct,
      hp: fractureHpAt(state.battle.bossHpMax, pct),
      itemId,
      gems: Math.max(0, ITEMS[itemId].cost - FRACTURE_GEM_DISCOUNT),
      crossedBy: null,
      taken: null,
    });
  }
  return lines;
}

/** Called from applyDamageToBoss with the HP either side of one hit. Marks every line that hit took
 *  the boss past, in track order, and logs each crossing the moment it happens so the table hears
 *  about it during the swing rather than on the claimant's next turn.
 *
 *  `hpAfter <= line.hp` is the "past the line, or exactly on it" half of the rule. */
export function crossFractures(state: GameState, attackerId: PlayerId, hpBefore: number, hpAfter: number): void {
  const battle = state.battle;
  if (!battle || battle.fractures.length === 0) return;
  battle.fractures.forEach((line, index) => {
    if (line.crossedBy !== null) return;
    if (!(hpBefore > line.hp && hpAfter <= line.hp)) return;
    line.crossedBy = attackerId;
    battle.log.push({ t: 'FRACTURE_CROSSED', playerId: attackerId, index, itemId: line.itemId, hp: line.hp });
  });
}

export interface OwedFracture {
  index: number;
  itemId: ItemId;
  gems: number;
}

/** Bounties this player has crossed and not yet taken. Derived rather than stored on the fighter:
 *  the line is the thing that was crossed, so the line owns the fact. */
export function owedFractures(state: GameState, playerId: PlayerId): OwedFracture[] {
  const battle = state.battle;
  if (!battle) return [];
  const owed: OwedFracture[] = [];
  battle.fractures.forEach((line, index) => {
    if (line.crossedBy === playerId && line.taken === null) owed.push({ index, itemId: line.itemId, gems: line.gems });
  });
  return owed;
}

/** Whether gems taken right now can still be spent. There is no camp after the last boss, so gems
 *  banked in that battle are dead on arrival — the cash option is real for bosses 1 and 2 and a
 *  trap on boss 3. Exposed rather than used to silently remove the option: a player who can see the
 *  choice is bad has learned something about the game; one who never sees it has been robbed. */
export function fractureGemsAreSpendable(state: GameState): boolean {
  return state.bossIndex < state.bossQueue.length - 1;
}

/** Takes one owed bounty. Throws on a line this player is not owed — the same engine-boundary
 *  policy as declareSkill, which this is called from: the UI builds only legal claims, so anything
 *  else is a desynced caller and should be loud rather than silently dropped. */
export function claimFracture(state: GameState, playerId: PlayerId, index: number, take: 'item' | 'gems'): void {
  const battle = state.battle!;
  const line = battle.fractures[index];
  if (!line) throw new Error(`no fracture line ${index}`);
  if (line.crossedBy !== playerId) throw new Error(`fracture ${index} is not owed to player ${playerId}`);
  if (line.taken !== null) throw new Error(`fracture ${index} has already been taken`);
  line.taken = take;
  grantFracture(state, playerId, line, take, false);
}

/** Anything still owed when the battle ends is taken as the item. The item is the headline reward
 *  and the one that survives the battle boundary — gems would be the strictly worse default here,
 *  and on the last boss they would be worth literally nothing. */
export function settleUnclaimedFractures(state: GameState): void {
  const battle = state.battle;
  if (!battle) return;
  for (const line of battle.fractures) {
    if (line.crossedBy === null || line.taken !== null) continue;
    line.taken = 'item';
    grantFracture(state, line.crossedBy, line, 'item', true);
  }
}

function grantFracture(
  state: GameState,
  playerId: PlayerId,
  line: FractureLine,
  take: 'item' | 'gems',
  auto: boolean,
): void {
  const prog = state.progress[playerId];
  if (take === 'gems') {
    prog.gems += line.gems;
  } else if (ITEMS[line.itemId].consumable) {
    prog.items.push(line.itemId);
  } else {
    // A permanent won off a fracture has to reach the live fighter too, not just the sheet: every
    // read site for permanents goes through Fighter.itemPermanents, which prepareBattle copies once
    // at setup and nothing updates afterwards. A permanent bought at camp lands before the next
    // prepareBattle; one won mid-battle does not, so without this it would do nothing until the
    // following boss.
    prog.permanents.push(line.itemId);
    const fighter = state.battle?.fighters.find((f) => f.playerId === playerId);
    if (fighter) fighter.itemPermanents = [...fighter.itemPermanents, line.itemId];
  }
  state.battle?.log.push({
    t: 'FRACTURE_CLAIMED',
    playerId,
    index: state.battle.fractures.indexOf(line),
    itemId: line.itemId,
    take,
    gems: line.gems,
    auto,
  });
}
