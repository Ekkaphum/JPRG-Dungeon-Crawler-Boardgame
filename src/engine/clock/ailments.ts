// v0.4.0 — the status-ailment engine.
//
// Deliberately thin: every ailment's lifetime is `expiresAtSlot`, exactly the convention Blessing
// and the weak point already use (the marker counts down, so an effect holds while
// `marker > expiresAtSlot`). Nothing here introduces a new notion of time.
//
// Where each ailment actually bites:
//   poison  → tickPoisonOnBossAction()  — called from bossAI when the boss acts
//   bleed   → tickOnOwnVisit()          — called from walk.ts when a fighter is visited
//   burn    → tickOnOwnVisit()          — same hook, one-shot
//   doom    → expireAilmentsAtMarker()  — fires when its timer runs out instead of just lapsing
//   freeze  → ailmentTimeTax()          — read by skills.ts at declare time
//   daze    → ailmentTimeTax()          — same
//   blind   → ailmentRollPenalty()      — read by skills.ts's dice ladder
//   silence → isSilenced()              — checked at declare time

import { AILMENTS, type AilmentId } from '@content/ailments';
import { hasV040Content } from '@content/rulesets';
import { applyDamageToFighter } from './damage';
import type { Fighter, GameState } from './types';

/** Whether ailments run at all in this game. Every entry point checks this, so the v0.3 ruleset
 *  behaves exactly as it did before the system existed. */
export function ailmentsEnabled(state: GameState): boolean {
  return hasV040Content(state.ruleset);
}


/**
 * Puts an ailment on a fighter. Returns false when nothing was applied, so callers can log a
 * cleanse rather than a hit.
 *
 * `singleTarget` exists for Luna's Holy Water: her passive has always read "cancel the debuff a
 * single-target boss move would put on her", and this is the first release where that sentence has
 * anything to cancel. AoE deliberately still lands on her — the passive is a reward for the boss
 * choosing her specifically, not blanket immunity.
 *
 * Keyed to Luna herself rather than to the Holy Water passive on purpose, and it is worth writing
 * down why, because it reads like a bug. Ailments exist only under hasV040Content, and v0.4 is also
 * the only ruleset running the v0.4.5 rework — so "the ruleset with ailments" and "the ruleset where
 * Luna's passive is Divine Tithe instead of Holy Water" are the *same* ruleset. Gating this on the
 * passive id would therefore not scope the ward to v0.3; it would delete it from the game outright,
 * silently taking away the party's only protection from a single-target debuff. The ward stays, and
 * Divine Tithe's own description names it (V045_PASSIVES.Luna) so the text matches the code.
 */
export function applyAilment(
  state: GameState,
  target: Fighter,
  id: AilmentId,
  opts: { singleTarget?: boolean } = {}
): boolean {
  if (!ailmentsEnabled(state)) return false;
  const battle = state.battle!;
  if (!target.alive) return false;

  if (target.charId === 'Luna' && opts.singleTarget) {
    battle.log.push({ t: 'AILMENT_WARDED', playerId: target.playerId, ailment: id });
    return false;
  }

  const def = AILMENTS[id];
  const existing = target.ailments.find((a) => a.id === id);
  const expiresAtSlot = battle.marker - def.slots;

  if (existing) {
    // Re-applying always refreshes the timer; whether it also stacks is per-ailment.
    existing.expiresAtSlot = Math.min(existing.expiresAtSlot, expiresAtSlot);
    if (existing.stacks < def.maxStacks) existing.stacks += 1;
  } else {
    target.ailments.push({ id, expiresAtSlot, stacks: 1 });
  }
  battle.log.push({ t: 'AILMENT_APPLIED', playerId: target.playerId, ailment: id });
  return true;
}

/** Removes every ailment from a fighter — what a cleanse effect calls. */
export function cleanseAilments(state: GameState, target: Fighter): number {
  const n = target.ailments.length;
  if (n > 0) {
    target.ailments = [];
    state.battle!.log.push({ t: 'AILMENT_CLEANSED', playerId: target.playerId });
  }
  return n;
}

export function hasAilment(f: Fighter, id: AilmentId): boolean {
  return f.ailments.some((a) => a.id === id);
}

function stacksOf(f: Fighter, id: AilmentId): number {
  return f.ailments.find((a) => a.id === id)?.stacks ?? 0;
}

/** Extra ⏱ a fighter's next declare costs. Freeze and daze add up rather than overriding, which is
 *  what makes carrying both genuinely bad rather than merely redundant. */
export function ailmentTimeTax(f: Fighter): number {
  return (hasAilment(f, 'freeze') ? 2 : 0) + stacksOf(f, 'daze');
}

/** How much harder blind makes every dice target. */
export function ailmentRollPenalty(f: Fighter): number {
  return hasAilment(f, 'blind') ? 1 : 0;
}

/** Silence bars any skill that spends a resource — mana, sand, shadow or souls. */
export function isSilenced(f: Fighter): boolean {
  return hasAilment(f, 'silence');
}

/** Freeze and daze are spent by the declare they tax, not by the clock. Called right after a
 *  successful declare so the penalty applies exactly once. */
export function consumeTimeTaxAilments(state: GameState, f: Fighter) {
  if (!ailmentsEnabled(state)) return;
  f.ailments = f.ailments.filter((a) => a.id !== 'freeze' && a.id !== 'daze');
}

/** Poison ticks on the *boss's* schedule — the one thing the party cannot slow down. */
export function tickPoisonOnBossAction(state: GameState) {
  if (!ailmentsEnabled(state)) return;
  for (const f of state.battle!.fighters) {
    if (!f.alive) continue;
    const stacks = stacksOf(f, 'poison');
    if (stacks > 0) {
      state.battle!.log.push({ t: 'AILMENT_TICK', playerId: f.playerId, ailment: 'poison', dmg: 2 * stacks });
      applyDamageToFighter(state, f, 2 * stacks);
    }
  }
}

/** Burn and bleed tick on the victim's own visit — the mirror of poison, so acting more often is
 *  the cost rather than the cure. Called from walk.ts before the fighter declares. */
export function tickOnOwnVisit(state: GameState, f: Fighter) {
  if (!ailmentsEnabled(state) || !f.alive) return;
  const bleedStacks = stacksOf(f, 'bleed');
  if (bleedStacks > 0) {
    state.battle!.log.push({ t: 'AILMENT_TICK', playerId: f.playerId, ailment: 'bleed', dmg: bleedStacks });
    applyDamageToFighter(state, f, bleedStacks);
  }
  if (hasAilment(f, 'burn') && f.alive) {
    state.battle!.log.push({ t: 'AILMENT_TICK', playerId: f.playerId, ailment: 'burn', dmg: 3 });
    applyDamageToFighter(state, f, 3);
    f.ailments = f.ailments.filter((a) => a.id !== 'burn');
  }
}

/**
 * Drops expired ailments. Doom is the exception that makes this function interesting: it does not
 * lapse harmlessly, it *fires* — the fighter goes down the moment its timer runs out, which is what
 * makes it a countdown rather than just another debuff with a duration.
 */
export function expireAilmentsAtMarker(state: GameState) {
  if (!ailmentsEnabled(state)) return;
  const battle = state.battle!;
  for (const f of battle.fighters) {
    if (f.ailments.length === 0) continue;
    const expired = f.ailments.filter((a) => battle.marker <= a.expiresAtSlot);
    if (expired.length === 0) continue;
    f.ailments = f.ailments.filter((a) => battle.marker > a.expiresAtSlot);
    for (const a of expired) {
      if (a.id === 'doom' && f.alive) {
        battle.log.push({ t: 'AILMENT_TICK', playerId: f.playerId, ailment: 'doom', dmg: f.hp });
        applyDamageToFighter(state, f, f.hp);
      } else {
        battle.log.push({ t: 'AILMENT_EXPIRED', playerId: f.playerId, ailment: a.id });
      }
    }
  }
}
