import { SAND_PER_REWIND, SKILLS, VERA_CHARGED_CAST_MANA, skillStats, type CharId } from '@content/characters';

/** Boss HP the party converts per slot of clock, averaged across a battle. Used to price the two
 *  v0.4.0 cards that buy time instead of dealing damage. Derived from GAME_DESIGN §10's own figures:
 *  ~105-110 damage across a 24-slot clock. Deliberately a single shared constant so Haste and Rewind
 *  are valued on the same scale as each other. */
const PARTY_DAMAGE_PER_SLOT = 4.5;
const PARTY_SIZE = 4;
import { applySomnivarTax, type Choice, type GameState } from '@engine/index';

/** Rough per-⏱ value estimate for a candidate DECLARE_ACTION choice. Fully deterministic where
 *  the doc's numbers are deterministic (this ruleset hides nothing — GAME_DESIGN_v0_3_0.md §4.4)
 *  — the only genuine unknowns are Sharp Shooting's dice roll and the boss's next d6, which this just
 *  prices in as a flat expected-value bonus rather than simulating forward. */
export function estimateChoiceValue(state: GameState, playerId: number, choice: Extract<Choice, { kind: 'DECLARE_ACTION' }>): number {
  const battle = state.battle!;
  const fighter = battle.fighters.find((f) => f.playerId === playerId)!;
  const isLv2 = !!state.progress[playerId]?.isLv2[choice.skillId];
  const stats = skillStats(choice.skillId, isLv2);
  const def = SKILLS[choice.skillId];
  const timeCost = battle.bossId === 'Somnivar' && stats.time >= 5 ? stats.time + 2 : stats.time;
  const buffAtk = (battle.partyBuff?.atk ?? 0) + (battle.weakPoint ? 4 : 0);

  let value: number;
  switch (def.kind) {
    case 'attack': {
      // v0.4.0: Aura Smite cleanses the whole party, so its worth is its damage *plus* whatever the
      // party is currently carrying — a doomed ally is priced as the life the smite is about to
      // save. Because the cleanse rides an attack, valuing it never pulls the bot away from the
      // damage race the way a heal-based cleanse did.
      if (choice.skillId === 'AuraSmite') {
        const doomed = battle.fighters.filter((f) => f.alive && f.ailments.some((a) => a.id === 'doom'));
        const otherAilments = battle.fighters.reduce((n, f) => n + (f.alive ? f.ailments.length : 0), 0) - doomed.length;
        const rescue = doomed.reduce((n, f) => n + f.hp * 1.5, 0) + otherAilments * 1.5;
        const armorS = def.ignoresArmor ? 0 : battle.armor;
        value = Math.max(0, stats.primary! + buffAtk - armorS) + rescue;
        break;
      }
      // Multi-hit is driven by whether `secondary` (hit count) is set, not by which skill this is
      // — matches the engine's own resolve logic (skills.ts). Was hardcoded to 'TwinShot'
      // specifically, which would have made bots value Dax's Flurry (also multi-hit) at 1/3 of its
      // real damage and never pick it over single-hit alternatives.
      const hits = stats.secondary ?? 1;
      const armor = def.ignoresArmor ? 0 : battle.armor;
      value = Math.max(0, stats.primary! + buffAtk - armor) * hits;
      break;
    }
    case 'attackGated': {
      // Slash resolves for `secondary` while the caster is at/below the HP tier and `primary`
      // otherwise. Priced off the tier that applies *right now* — the bot can't know whether a
      // teammate will heal the boost away before it lands, and §4.4 gives it no way to ask.
      const base = fighter.hp <= 5 && stats.secondary != null ? stats.secondary : stats.primary!;
      value = Math.max(0, base + buffAtk - battle.armor);
      break;
    }
    case 'attackRoll': {
      value = Math.max(0, stats.primary! + buffAtk - battle.armor) + 2.5; // + chance to open a weak point
      break;
    }
    case 'attackMana': {
      const total = stats.primary! + stats.secondary! * (choice.manaSpent ?? 0) + buffAtk;
      value = Math.max(0, total - battle.armor);
      break;
    }
    case 'multiHit': {
      // Multi Shot: the resolve-time primary hit plus every early hit (Kit's own — same armor/buff
      // approximation as everything else here, priced at today's buffAtk even though the early hits
      // actually land at different future slots).
      const hits = [stats.primary!, ...(stats.earlyHits ?? []).map((h) => h.dmg)];
      value = hits.reduce((sum, dmg) => sum + Math.max(0, dmg + buffAtk - battle.armor), 0);
      break;
    }
    case 'heal': {
      const target = battle.fighters.find((f) => f.playerId === choice.targetPlayerId);
      if (!target) return -Infinity;
      const missing = target.maxHp - target.hp;
      const urgency = target.hp / target.maxHp < 0.35 ? 2 : 1;
      value = Math.min(stats.primary!, missing) * 1.4 * urgency;
      break;
    }
    case 'buffCounter':
      value = fighter.hp < fighter.maxHp * 0.6 ? 7 : 2.5;
      break;
    case 'buffParty':
      value = 9; // whole-party buff, generally strong regardless of state
      break;
    case 'buffMana':
      value = fighter.mana < 3 ? 4.5 : 2;
      break;
    case 'guard': {
      // Deliberately a *low floor*. Guard deals no damage, and this ruleset's binding constraint is
      // party damage before the clock runs out (§10) — so blind mitigation has to score worse than
      // just attacking, or the party guards itself to death on the clock. Guard is meant to win
      // only when the boss's already-declared move says it will: that read lives in
      // comboSynergyBonus below, which is where nearly all of this skill's value comes from.
      const ward = battle.fighters.find((f) => f.playerId === choice.targetPlayerId);
      if (!ward || !ward.alive || ward.playerId === playerId) return -Infinity;
      const wardFragility = 1 - ward.hp / ward.maxHp;
      const ownHeadroom = fighter.hp / fighter.maxHp;
      // The attack buff handed to the ward is the part that is always worth something, so price it
      // like the party buff it resembles; the absorption on top scales with how much trouble the
      // ward is actually in and how much room Eric has left to take hits.
      value = (stats.secondary ?? 0) * 1.2 + wardFragility * 4 * ownHeadroom;
      break;
    }
    case 'trap': {
      // The boss's pawn only moves on its own turn, so a trap armed exactly on the slot it is
      // sitting on is certain to connect; anywhere else is a near-certain waste. Beyond the damage,
      // connecting pushes that pawn back 2 slots — which since v0.3.14 is the only lever anyone has
      // on the boss's tempo, because there is no declared move left to cancel or delay. Same flat
      // premium the delay version carried; a 3,000-game sim put cancel and delay within noise.
      if (choice.trapSlot !== battle.bossSlot) return 0.2;
      value = stats.primary! + 5;
      break;
    }
    // ── v0.4.0 (Chrono) ──
    // Both of these buy *clock* rather than damage, which estimateChoiceValue has no vocabulary for
    // — they fell through to `default: 0` and a bot holding Chrono simply never played them. The
    // conversion used here is the same one §10 uses to reason about the whole game: the party turns
    // roughly PARTY_DAMAGE_PER_SLOT of boss HP into a dead boss for every slot of clock it has.
    case 'buffHaste': {
      const target = battle.fighters.find((f) => f.playerId === choice.targetPlayerId);
      if (!target || !target.alive || target.playerId === playerId) return -Infinity;
      // Only the movement that actually happens is worth anything: an ally already up against the
      // marker cannot be pulled further, and the engine clamps it to a no-op.
      const gained = Math.min(battle.marker - 1, target.slot + (stats.primary ?? 0)) - target.slot;
      if (gained <= 0) return -Infinity;
      value = gained * PARTY_DAMAGE_PER_SLOT;
      break;
    }
    case 'rewind': {
      if (fighter.sand < SAND_PER_REWIND) return -Infinity;
      // Rewind hands its slots to all four seats at once, which is what makes a card that deals no
      // damage worth ⏱6. Valued as the party-wide clock it buys, not as Chrono's own turn.
      value = (stats.primary ?? 0) * PARTY_DAMAGE_PER_SLOT * PARTY_SIZE;
      break;
    }
    default:
      value = 0;
  }
  return value / Math.max(1, timeCost);
}

/** Rough post-armor damage a candidate attack would land, used only to spot "this could be the
 *  killing blow" for the shared Last Shot bonus (v0.3.7). Deliberately optimistic and approximate —
 *  it prices the buffs that are live *now* and ignores dice, same simplification estimateChoiceValue
 *  makes. Returns 0 for anything that isn't a direct attack. */
function estimateFinishingDamage(state: GameState, playerId: number, choice: Extract<Choice, { kind: 'DECLARE_ACTION' }>): number {
  const battle = state.battle!;
  const fighter = battle.fighters.find((f) => f.playerId === playerId)!;
  const isLv2 = !!state.progress[playerId]?.isLv2[choice.skillId];
  const stats = skillStats(choice.skillId, isLv2);
  const def = SKILLS[choice.skillId];
  let buffAtk = (battle.partyBuff?.atk ?? 0) + (battle.weakPoint ? 4 : 0);
  if (fighter.charId === 'Eric' && fighter.hp < 7) buffAtk += 4; // Berserk
  const armor = def.ignoresArmor ? 0 : battle.armor;
  const perHit = (base: number) => Math.max(0, base + buffAtk - armor);

  switch (def.kind) {
    case 'attack':
      return perHit(stats.primary ?? 0) * (stats.secondary ?? 1);
    case 'attackRoll':
      return perHit(stats.primary ?? 0);
    case 'attackMana':
      return perHit((stats.primary ?? 0) + (stats.secondary ?? 0) * (choice.manaSpent ?? 0));
    case 'multiHit':
      return perHit(stats.primary ?? 0) + (stats.earlyHits ?? []).reduce((sum, h) => sum + perHit(h.dmg), 0);
    default:
      return 0;
  }
}

/** Extra nudge toward a bot's own personal score conditions — without this, heuristic bots play
 *  purely for the party's survival and never compete for points the way the doc's human players
 *  are expected to (see docs/10-v0.3.0-rulings and the v0.2.0 lesson in HANDOFF.md §15.4 about
 *  "too-safe" bots making the game trivially easy for the human). */
export function scoreConditionBonus(state: GameState, playerId: number, choice: Extract<Choice, { kind: 'DECLARE_ACTION' }>): number {
  const battle = state.battle!;
  const fighter = battle.fighters.find((f) => f.playerId === playerId)!;
  const player = state.players.find((p) => p.id === playerId)!;
  let bonus = 0;

  // Everyone now shares the Last Shot bonus (v0.3.7), so angling for the kill is no longer a
  // Eric/Liora-only nudge — any character with a real chance to finish the boss should reach for it.
  const finisher = estimateFinishingDamage(state, playerId, choice);
  if (finisher > 0 && battle.bossHp <= finisher) bonus += 2;

  if (player.charId === 'Eric') {
    // eric1 (>10 in one hit) is reachable specifically when Berserk is live, and Power Strike is the
    // card that gets there.
    if (choice.skillId === 'PowerStrike' && fighter.hp < 7) bonus += 2;
    // v0.3.7: Guard is a *scoring* card for him, not just a defensive one — eric2 pays per absorbed
    // hit, and eating those hits also drives him under half HP for eric3. Halved again in v0.3.15
    // alongside eric2's own 2 -> 1: after the v0.3.14 boss pass a standing Guard connects on nearly
    // every boss action, so the condition needed no encouragement at all to reach 4.36 fires/win.
    if (choice.skillId === 'Guard') bonus += 0.5;
  }
  if (player.charId === 'Liora') {
    // v0.3.7: liora2 wants a *fully charged* cast (all 3 mana) and liora3 wants a Meteor to have
    // connected, so the nudge is toward charging up and spending it on the big spell — not toward
    // sniping the last hit, which the shared finisher bonus above already covers.
    const manaSpent = choice.manaSpent ?? 0;
    // Kept deliberately small. Every one of these bonuses is added to estimateChoiceValue's per-⏱
    // figure, which is itself only ~1-5, so anything at 3+ stops being a nudge and starts dictating
    // the whole decision — tried at 3 and Liora's win share went to 84.9% purely on bot weighting,
    // which measures the heuristic rather than the design.
    if (manaSpent >= VERA_CHARGED_CAST_MANA) bonus += 1.5;
    // Banking mana is itself a scoring move for her now: estimateChoiceValue always prefers spending
    // whatever she holds (more mana = more damage right now), so without this she never accumulates
    // enough to clear liora2's bar at all — measured 0.00 fires per win before this nudge existed.
    if (choice.skillId === 'AuraCharge' && fighter.mana < VERA_CHARGED_CAST_MANA) bonus += 1.5;
    // liora3 wants a 14+ hit banked, not Meteor specifically — but Meteor is the surest way there.
    if (choice.skillId === 'Meteor' && !fighter.landedMeteorThisBattle) bonus += 1;
  }
  if (player.charId === 'Kit') {
    // kit3 pays per 4 attacks with no ceiling now, so cheap repeatable attacks matter throughout the
    // battle rather than only up to a bar — and Multi Shot is worth 3 of them from a single declare.
    if (choice.skillId === 'QuickShot') bonus += 1;
    if (choice.skillId === 'MultiShot') bonus += 1;
    // kit1 pays on the roll landing AND on every hit that cashes the window in afterwards (any
    // player's, Kit's own included) — the double-dip restored after a hit-only cut proved too costly
    // (kit1 4.18 -> 2.35 pts/win, Kit's win share 25.6% -> 11.6% at hard). Sized the same as Liora's
    // charge nudge. Opening a second window while one is already up scores nothing extra either way,
    // so this does not fire then.
    if (choice.skillId === 'SharpShooting' && !battle.weakPoint) bonus += 1.5;
    // kit2: Trap pays only when the trap actually triggers, so this is gated on the trap being armed
    // where it can connect at all — the boss pawn only moves on its own turn, so a trap on the slot
    // it is already sitting on is the only placement that reliably springs. Ungated (as it was at
    // 0.5) the nudge is added even to a doomed placement, cancelling out estimateChoiceValue's own
    // 0.2 misplacement floor; a probe at +10 ungated had Kit arming 32k traps with 56% expiring
    // unsprung and the party never killing anything (0% win rate). Sized to beat Sharp Shooting's
    // 1.5 nudge once placement is right, since a connecting trap cancels the boss's entire turn.
    if (choice.skillId === 'Trap' && choice.trapSlot === battle.bossSlot) bonus += 0.5;
  }
  if (player.charId === 'Luna') {
    if (choice.skillId === 'Heal' && choice.targetPlayerId !== playerId) bonus += 0.5;
  }
  if (player.charId === 'Chrono') {
    // chrono2 pays when the ally he hastened spends the visit he bought them on damage, so the
    // nudge goes to hastening whoever is most likely to actually attack next — approximated as the
    // ally who has dealt the most so far. Sized like Liora's charge nudge.
    if (choice.skillId === 'Haste') {
      const target = battle.fighters.find((f) => f.playerId === choice.targetPlayerId);
      const best = Math.max(...battle.fighters.filter((f) => f.alive && f.playerId !== playerId).map((f) => f.damageDealtThisBattle));
      if (target && target.damageDealtThisBattle >= best) bonus += 1;
    }
    // chrono3 wants the battle over with clock to spare, which is the same thing Rewind buys — but
    // only while there is still a battle to spend it on. Late, with the boss nearly dead, the slots
    // are worth less than the ⏱6 spent getting them.
    if (choice.skillId === 'Rewind' && battle.bossHp > battle.bossHpMax * 0.3) bonus += 1;
  }
  return bonus;
}

/** Cross-player timing awareness the per-⏱ value above can't see on its own: whether declaring
 *  this now would line up with the stacked weak-point + Blessing + big-hit combo
 *  GAME_DESIGN_v0_3_0.md §8/§9 calls out as the *only* way Kit or Luna can help break Aurelius's
 *  armor (each alone tops out under the >12-post-armor threshold). Every bot tier scores its own
 *  pending action in isolation — this reads teammates' *already-declared* pending actions and the
 *  boss's *already-rolled* next move off shared battle state (all public per §4.4, "เปิดเผยหมด"),
 *  so it recognizes a window that's already forming rather than planning one that might not happen.
 *
 *  Deliberately conservative: it only fires when the timing already lines up given what's known
 *  right now, never "declare X and hope a teammate follows up later" — that direction has no
 *  landedAtSlot to check yet, so it would be a guess, not a read of visible information. */
export function comboSynergyBonus(state: GameState, playerId: number, choice: Extract<Choice, { kind: 'DECLARE_ACTION' }>): number {
  const battle = state.battle!;
  const player = state.players.find((p) => p.id === playerId)!;
  const isLv2 = !!state.progress[playerId]?.isLv2[choice.skillId];
  const timeCost = applySomnivarTax(state, skillStats(choice.skillId, isLv2).time);
  const landedAtSlot = battle.marker - timeCost;

  const pendingOf = (charId: CharId) => {
    const p = state.players.find((pp) => pp.charId === charId);
    const f = p ? battle.fighters.find((ff) => ff.playerId === p.id) : undefined;
    return f?.pending ?? null;
  };
  const isBigHit = (skillId: string) => skillId === 'Fireball' || skillId === 'Meteor';
  // The boss's pawn is now the entire public signal about it (v0.3.14): the party knows when it
  // acts next and nothing else. Its next action is what clears the weak point, whatever that
  // action turns out to be.
  const bossNextActsAt = battle.bossSlot;

  let bonus = 0;

  if (player.charId === 'Kit' && choice.skillId === 'SharpShooting' && !battle.weakPoint) {
    const veraPending = pendingOf('Liora');
    if (veraPending && isBigHit(veraPending.skillId)) {
      // Opens in time to still be up when Liora's hit resolves, and the boss's own already-rolled
      // next move (if any) won't clear it first.
      const opensInTime = landedAtSlot >= veraPending.landedAtSlot;
      const bossWontInterrupt = bossNextActsAt < veraPending.landedAtSlot;
      if (opensInTime && bossWontInterrupt) bonus += 5;
    }
  }

  // Eric's Guard used to be the clearest "read the board" play in his kit: the boss's next move was
  // rolled and public, so who it would hit was knowable. Since v0.3.14 it is knowable no longer —
  // the boss acts the instant its pawn is visited, so all Eric has is *when*, never *what*. Guard is
  // therefore priced as a bet: it has to still be up when the boss acts, and it pays off in
  // proportion to how badly the ward would suffer an average hit. Note this is strictly less
  // information than before, and deliberately so — see docs/GAME_DESIGN.md §9.
  if (player.charId === 'Eric' && choice.skillId === 'Guard') {
    const fighter = battle.fighters.find((f) => f.playerId === playerId)!;
    const ward = battle.fighters.find((f) => f.playerId === choice.targetPlayerId);
    // Guard expires at Eric's own next visit, so it covers anything the boss does at or above his
    // landing slot. Miss that window and the skill is pure lost tempo.
    const coversTheHit = ward && ward.alive && landedAtSlot <= battle.bossSlot;
    if (coversTheHit) {
      // Sized against what Guard actually buys, not against how good it feels: absorbing a hit the
      // ward would have survived is worth roughly what Slash gives up (§10's damage budget has no
      // slack for pure mitigation), while absorbing one that would have *killed* them is worth
      // several actions — a dead teammate loses their turns, their revive comes back at half HP,
      // and luna3 pays the whole party. Only the second case should beat attacking.
      //
      // Scaled down from the old flat payout because the bet can now simply be wrong: the boss may
      // pick an AoE (where Guard is close to pointless — Eric eats his own share plus the ward's)
      // or aim somewhere else entirely. Roughly a 1-in-3 chance of covering the right single
      // target, so the "saved a life" case is priced at about a third of what certainty was worth.
      const biggestPlausibleHit = 12 + battle.rage;
      const wardWouldDie = ward.hp <= biggestPlausibleHit;
      const ericWouldSurvive = fighter.hp > biggestPlausibleHit;
      if (wardWouldDie && ericWouldSurvive) bonus += 3;
      else bonus += 0.5;
    }
  }

  if (player.charId === 'Luna' && choice.skillId === 'Blessing' && !battle.partyBuff) {
    const kitPending = pendingOf('Kit');
    const veraPending = pendingOf('Liora');
    const weakPointComing = !!battle.weakPoint || kitPending?.skillId === 'SharpShooting';
    // Unlike weak point (turns on at resolve), Blessing is active from the moment it's *declared*
    // (now) until Luna's own resolve — so it covers Liora's hit only if Luna's expiry (this
    // candidate's landedAtSlot) falls at or after Liora's resolve, i.e. a *smaller* marker value.
    const bigHitComing = !!veraPending && isBigHit(veraPending.skillId) && landedAtSlot <= veraPending.landedAtSlot;
    if (weakPointComing || bigHitComing) bonus += 5;
  }

  return bonus;
}
