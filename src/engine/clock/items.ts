// v0.5 "camp" ruleset — spending items during a battle.
//
// Items are a FREE ACTION taken on your own visit, before you declare: any number, no ⏱ cost. They
// are resolved here, from the `useItems` array folded into the DECLARE_ACTION choice, so the walk
// loop, the replay format and every bot keep the exact shape they already had.
//
// Every effect below is built on machinery that already existed and was being used by one card
// each — `scheduledHits` for the poison, `weakPointActive` for the lens, `bossSlot` for the
// grapnel, `stackSeq` for the banner (docs/DESIGN_VARIABLES.md §2). Nothing here introduces a new
// timing concept for a player to learn.

import { ITEMS, type ItemId } from '@content/items';
import { CHARACTERS } from '@content/characters';
import { healFighter } from './damage';
import { cleanseAilments } from './ailments';
import { WEAK_POINT_SLOTS } from './skills';
import { GULVORAX_POISON_HP, itemPotency, onBossPushedBack } from './bossRules';
import type { Fighter, GameState } from './types';

/** Applies one item and returns whether it actually did anything. A no-op (healing someone already
 *  at full, reviving nobody) still consumes the card: the decision to spend it was the player's,
 *  and refunding it would let a table probe the board state for free. */
export function useItem(state: GameState, user: Fighter, itemId: ItemId, targetPlayerId?: number): void {
  const battle = state.battle!;
  const def = ITEMS[itemId];
  const target =
    targetPlayerId != null ? battle.fighters.find((f) => f.playerId === targetPlayerId) ?? user : user;

  // 🍴 Gulvorax's battle tax (§3.6): he steals half of every item the party spends — the gems they
  // shopped with, eaten. Applied to the *value* rather than by refusing the card, so a halved item
  // still does its job, just badly. The one card he cannot touch is one used from inside his belly,
  // which itemPotency lets through whole and which poisons him below.
  const value = itemPotency(state, user, def.value);

  switch (def.kind) {
    case 'heal':
      healFighter(target, value);
      break;
    case 'cleanse':
      cleanseAilments(state, target);
      break;
    case 'atkBuff':
      user.itemAtkBonus += value;
      break;
    case 'pierce':
      user.itemPierce = true;
      break;
    case 'ward':
      user.itemWard += value;
      break;
    case 'absorb':
      // Takes the larger rather than stacking, so buying a Smoke Bomb on top of a Bulwark Charm is
      // a wasted card instead of a 109-point wall.
      user.itemAbsorb = Math.max(user.itemAbsorb, value);
      break;
    case 'haste':
      // Consumed by declareSkill via pendingHaste below — stored on the fighter because the ⏱ cut
      // has to survive from "item spent" to "skill declared" inside the same visit.
      user.itemHaste += value;
      break;
    case 'poisonSlots': {
      // Writes flat damage onto the next N slots the marker will reach. No roll, no boss-position
      // check — the mirror image of Kit's trap, which needs both but ignores armor and shoves the
      // boss. Two cards, one primitive, different jobs.
      for (let i = 1; i <= value && battle.marker - i > 0; i++) {
        battle.scheduledHits.push({ slot: battle.marker - i, dmg: value, ownerId: user.playerId, skillId: 'Slash' });
      }
      break;
    }
    case 'revive': {
      if (target.alive) break;
      target.alive = true;
      target.hp = CHARACTERS[target.charId].reviveHp;
      target.reviveAtSlot = null;
      target.pending = null;
      target.slot = battle.marker;
      target.stackSeq = battle.nextStackSeq++;
      battle.log.push({ t: 'REVIVE', playerId: target.playerId, atSlot: battle.marker, hp: target.hp });
      break;
    }
    case 'bossPush':
      battle.bossSlot = Math.max(0, battle.bossSlot - def.value);
      // ⏪ A pawn cannot retreat: shoving the Pawn Rank back strips a rank (§4.3).
      onBossPushedBack(state);
      break;
    case 'weakPoint':
      // Must use the same lifetime as the skill path. The first version set expiresAtSlot: 0, which
      // is not "no expiry set" but "expires at slot 0" — i.e. a party-wide +4 that stayed up for the
      // entire rest of the battle for one card.
      battle.weakPoint = { ownerId: user.playerId, expiresAtSlot: battle.marker - WEAK_POINT_SLOTS, hitsPaid: 0 };
      break;
    case 'queueJump':
      // Lowest stackSeq resolves first, so claiming the bottom of the stack is what "go first"
      // means here — see resolveOrderCompare in walk.ts.
      user.stackSeq = -1;
      break;
    case 'reviveFast':
    case 'antiDisplace':
      // Permanents never reach this path: they are read where they matter (damage.ts for the
      // revival slot, bossAI.ts for displacement) rather than being "used".
      break;
  }
}

/** Spends every item named in a DECLARE_ACTION choice. Silently skips anything the player does not
 *  actually hold, so a malformed choice cannot conjure cards. */
export function spendItems(
  state: GameState,
  fighter: Fighter,
  uses: { itemId: ItemId; targetPlayerId?: number }[] | undefined
): void {
  if (!uses || uses.length === 0) return;
  const prog = state.progress[fighter.playerId];
  for (const use of uses) {
    const idx = prog.items.indexOf(use.itemId);
    if (idx < 0) continue;
    prog.items.splice(idx, 1);
    useItem(state, fighter, use.itemId, use.targetPlayerId);
    // 🤢 §3.6's weakness. An item swallowed whole gives Gulvorax food poisoning — 8 HP and his
    // entire next turn — which makes the person he ate the only one who can force-feed him. That is
    // what stops being swallowed from being pure punishment: the party may deliberately hold off on
    // the rescue and pass cards to the player inside instead.
    poisonGulvoraxIfForceFed(state, fighter);
  }
}

function poisonGulvoraxIfForceFed(state: GameState, user: Fighter): void {
  const battle = state.battle!;
  if (battle.bossId !== 'Gulvorax' || battle.swallowedId !== user.playerId) return;
  battle.bossHp = Math.max(0, battle.bossHp - GULVORAX_POISON_HP);
  battle.bossTurnSkipped = true;
  battle.log.push({ t: 'BOSS_TURN_LOST', bossId: battle.bossId, reason: 'poisoned' });
  if (battle.bossHp <= 0 && battle.outcome === 'in_progress') {
    battle.finishedBy = user.playerId;
    battle.outcome = 'boss_defeated';
  }
}

