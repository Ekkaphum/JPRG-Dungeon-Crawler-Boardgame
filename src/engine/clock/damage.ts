// Central damage/heal pipeline — every skill and boss move funnels through these so the buff/armor/
// rage/death rules in docs/10-v0.3.0-rulings.md §6 apply uniformly instead of being reimplemented
// per skill.

import { BOSSES } from '@content/bosses3';
import { SOULS_PER_POINT, SOUL_HP_LOSS_THRESHOLD, CHARACTERS, LAST_SHOT_CONDITION_ID, LUNA1_ALLY_SCORES_PER_POINT, scorePoints, type SkillId } from '@content/characters';
import type { BattleState, Fighter, GameState, ScoreEntry } from './types';

/** Berserk's threshold (@content/characters PASSIVES.Eric) — always-on, checked here rather than
 *  once at declare so a mid-flight heal that pulls Eric back above it drops the bonus, same resolve-
 *  time timing the old Slash HP tier used. */
const BERSERK_HP_THRESHOLD = 7;

/** Outgoing damage a player deals to the boss: base + party Blessing atk buff + weak-point bonus +
 *  Eric's Berserk passive.
 *  "ทุกคน" buffs never apply to the boss (GAME_DESIGN_v0_3_0.md §5.1) so this is player-only. */
export function computeOutgoingPlayerDamage(battle: BattleState, base: number, attackerId?: number): number {
  let dmg = base;
  if (battle.partyBuff) dmg += battle.partyBuff.atk;
  if (battle.weakPoint) dmg += 4;
  if (attackerId != null) {
    const attacker = battle.fighters.find((f) => f.playerId === attackerId);
    if (attacker?.charId === 'Eric' && attacker.alive && attacker.hp < BERSERK_HP_THRESHOLD) dmg += 4;
  }
  return dmg;
}

export interface BossDamageResult {
  effective: number;
  armorBroke: boolean;
}

/** Applies damage to the boss: armor reduction (unless ignored), Rage tracking (Ragorath), armor
 *  break (Aurelius), HP floor at 0, and finishedBy bookkeeping. */
export function applyDamageToBoss(
  state: GameState,
  attackerId: number,
  dmg: number,
  opts: { ignoresArmor: boolean; skillId: SkillId; countsAsAttack?: boolean }
): BossDamageResult {
  const battle = state.battle!;
  const effective = Math.max(0, opts.ignoresArmor ? dmg : dmg - battle.armor);
  battle.bossHp = Math.max(0, battle.bossHp - effective);

  if (battle.bossId === 'Ragorath') battle.rage += 1;

  let armorBroke = false;
  if (battle.bossId === 'Aurelius' && !opts.ignoresArmor && effective > 12 && battle.armor > 0) {
    battle.armor -= 1;
    armorBroke = true;
  }

  // Set Trap's own trigger passes countsAsAttack:false — kit3 ("attacked the boss 5+ times") means
  // Quick Shot swings specifically, not trap detonations. GAME_DESIGN_v0_3_0.md's own worked
  // example treats them as separate budgets ("วางกับดัก 2 ครั้ง... Quick Shot ได้พอดี 5 ครั้ง" — 2 traps
  // placed, *then* exactly 5 Quick Shots fit in what's left — the traps aren't among the 5).
  const attacker = battle.fighters.find((f) => f.playerId === attackerId);
  // Counted for *every* source including traps, unlike attackCountThisBattle below — Frenzy asks
  // "who has hurt me most", and a trap that cut the boss hurt him just as much as a sword did.
  if (attacker) attacker.damageDealtThisBattle += effective;

  if (opts.countsAsAttack ?? true) {
    if (attacker) attacker.attackCountThisBattle += 1;
  }

  if (battle.bossHp <= 0 && battle.finishedBy === null) {
    battle.finishedBy = attackerId;
    battle.finishedBySkill = opts.skillId;
    battle.outcome = 'boss_defeated';
  }

  return { effective, armorBroke };
}

/** Applies damage to a player fighter: Blessing flat reduction, the fighter's own shield (mana flat
 *  or counter %), floors at 0, and kills the fighter if HP hits 0. Marks the counter shield as
 *  "triggered" even when the final damage rounds down to 0 (GAME_DESIGN_v0_3_0.md §8: "นับแม้ดาเมจ
 *  ที่เข้าจริงจะเป็น 0"). Returns the actual damage applied. */
export function applyDamageToFighter(
  state: GameState,
  fighter: Fighter,
  rawDamage: number,
  opts: { piercesPartyMitigation?: boolean; selfInflicted?: boolean } = {}
): number {
  // An AoE resolves one target at a time. Guard can redirect an earlier target's share onto Eric
  // and kill him before the loop reaches Eric's own share; that later share must not kill/log/count
  // the same fighter again.
  if (!fighter.alive) return 0;
  const battle = state.battle!;
  let dmg = rawDamage;
  // Aurelius's Procession pierces this (v0.3.11): a king's judgment is not talked down by a
  // cleric's blessing. Deliberately narrow — it ignores the *party-wide* buff only. Guard still
  // redirects it and a personal shield still absorbs it, so both remain real answers to it.
  // A cost the fighter chose to pay is not an attack: it ignores every mitigation layer, and it
  // must not feed Morvane's soul engine or Death Coil would partly refund its own surcharge.
  if (opts.selfInflicted) {
    fighter.hp = Math.max(0, fighter.hp - Math.max(0, rawDamage));
    if (fighter.hp * 2 < fighter.maxHp) fighter.everDroppedBelowHalfThisBattle = true;
    if (fighter.hp === 0) killFighter(state, fighter);
    return Math.max(0, rawDamage);
  }
  if (battle.partyBuff && !opts.piercesPartyMitigation) dmg -= battle.partyBuff.dmgReduction;
  if (fighter.shield?.kind === 'mana') dmg -= fighter.shield.reduction;
  if (fighter.shield?.kind === 'counter') {
    dmg = Math.floor(dmg * (1 - fighter.shield.reduction / 100));
    fighter.shield.hitDuringWindow = true;
  }
  dmg = Math.max(0, dmg);
  fighter.hp = Math.max(0, fighter.hp - dmg);
  // Latched, never cleared until the next battle — eric3 asks whether he *was* beaten down at any
  // point, so a later heal must not undo it. Strictly below half, so exactly half doesn't count.
  if (fighter.hp * 2 < fighter.maxHp) fighter.everDroppedBelowHalfThisBattle = true;
  // v0.4.0. Morvane's Undead Pact: a wound worth SOUL_HP_LOSS_THRESHOLD or more feeds him. Ordinary
  // chip damage deliberately does not, so the engine only turns over when he is genuinely in danger.
  if (fighter.charId === 'Morvane' && dmg >= SOUL_HP_LOSS_THRESHOLD) {
    grantSouls(state, fighter, 1);
  }
  if (fighter.hp === 0) killFighter(state, fighter);
  return dmg;
}

/** Morvane's soul counter, and the count-and-exchange payout that rides it. Every SOULS_PER_POINT
 *  souls scores morvane1 once — `soulsScored` tracks what has already been paid so the pile is not
 *  re-scored each time it grows. */
export function grantSouls(state: GameState, fighter: Fighter, amount: number) {
  if (amount <= 0 || fighter.charId !== 'Morvane') return;
  fighter.souls += amount;
  state.battle!.log.push({ t: 'SOULS_GAINED', playerId: fighter.playerId, amount, total: fighter.souls });
  const owed = Math.floor(fighter.souls / SOULS_PER_POINT) - fighter.soulsScored;
  if (owed > 0) {
    fighter.soulsScored += owed;
    pushScore(state, { playerId: fighter.playerId, conditionId: 'morvane1', points: owed * scorePoints('morvane1') });
  }
}

/** Heals a fighter, capped at maxHp. Returns the actual amount restored (0 if already full or dead
 *  — callers use this to gate Luna's condition 1, which requires restoring >=1 HP to an injured
 *  target). */
export function healFighter(fighter: Fighter, amount: number): number {
  if (!fighter.alive) return 0;
  // v0.4.0 — Morvane's Undead Pact, the hardest rule exception on the roster: no external healing
  // reaches him at all. His own Drain/Soul Siphon restore HP through a separate path (see
  // dealAttackFor's lifesteal), which is the whole reason those two cards exist.
  if (fighter.charId === 'Morvane') return 0;
  const before = fighter.hp;
  fighter.hp = Math.min(fighter.maxHp, fighter.hp + amount);
  return fighter.hp - before;
}

export function killFighter(state: GameState, fighter: Fighter) {
  // Idempotent by contract: callers may still hold a reference captured while this fighter was
  // alive (notably an AoE target list), but death, scoring and revival are recorded only once.
  if (!fighter.alive) return;
  const battle = state.battle!;
  fighter.alive = false;
  fighter.everDiedThisBattle = true;
  // v0.4.0: anyone going down feeds every Morvane at the table. Referenced as "someone died" rather
  // than by character, per DESIGN_VARIABLES §5.2 — and paired with morvane2 paying 3 points for
  // *undoing* a death, which is what stops the engine from rewarding him for wanting one.
  for (const other of battle.fighters) {
    if (other.charId === 'Morvane' && other.playerId !== fighter.playerId && other.alive) {
      grantSouls(state, other, 1);
    }
  }
  state.deathCounts[fighter.playerId] = (state.deathCounts[fighter.playerId] ?? 0) + 1;
  fighter.pending = null;
  fighter.shield = null;
  // Death cancels the entire unfinished Multi Shot. Hits that already fired stay fired; every
  // scheduled hit still in flight is removed now, so revival cannot resume the old action.
  battle.scheduledHits = battle.scheduledHits.filter((h) => h.ownerId !== fighter.playerId);
  // A dead guardian can't absorb anything — drop the link rather than leaving redirectTarget() to
  // filter it out on every hit. (A dead *ward* leaves the link standing on purpose: it costs
  // nothing while they're down, and it's still up if they revive inside Guard's window.)
  if (battle.guard?.guardianId === fighter.playerId) battle.guard = null;
  const reviveAt = battle.marker - 6;
  fighter.reviveAtSlot = reviveAt >= 0 ? reviveAt : null;
  // The pawn is physically moved to where it will come back (GAME_DESIGN_v0_3_0.md §5.4). Leaving
  // it on its old slot — which the marker has already walked past — meant a revived fighter could
  // never match the marker again and silently sat out the rest of the battle, and made the pawn
  // appear to jump backwards on the timeline the moment it revived.
  if (fighter.reviveAtSlot != null) {
    fighter.slot = fighter.reviveAtSlot;
    fighter.stackSeq = battle.nextStackSeq++;
  }
  battle.log.push({ t: 'DEATH', playerId: fighter.playerId, atSlot: battle.marker, reviveAtSlot: fighter.reviveAtSlot });

  // GAME_DESIGN_v0_3_0.md §1: "☠ แพ้ทั้งวง | ... หรือ ผู้เล่นตายหมดพร้อมกัน" — everyone down at once
  // ends the battle immediately, regardless of anyone's revival timer. Checked right here, the one
  // choke point every death passes through (applyDamageToFighter above), so an AoE that kills the
  // last survivor mid-resolution catches it the instant it happens rather than waiting for a tick
  // boundary that revival timers could otherwise let the party quietly play through.
  if (battle.outcome === 'in_progress' && battle.fighters.every((f) => !f.alive)) {
    battle.outcome = 'party_wiped';
    battle.log.push({ t: 'BATTLE_END', outcome: 'party_wiped', finishedBy: null, expGranted: 0 });
  }
}

/** Morvane's Raise Dead: back on the board *now*, at a fraction of max HP, instead of waiting out
 *  the standard 6-slot revive timer. Separate from reviveFighter because the HP is different (a
 *  share of max rather than the character's fixed reviveHp) and because there is no timer to clear
 *  in the normal way — the fighter is being pulled up ahead of schedule. */
export function reviveFighterNow(state: GameState, fighter: Fighter, percentOfMax: number) {
  const battle = state.battle!;
  fighter.alive = true;
  fighter.hp = Math.max(1, Math.floor((fighter.maxHp * percentOfMax) / 100));
  fighter.reviveAtSlot = null;
  fighter.pending = null;
  fighter.slot = battle.marker;
  fighter.stackSeq = battle.nextStackSeq++;
  battle.log.push({ t: 'REVIVE', playerId: fighter.playerId, atSlot: battle.marker, hp: fighter.hp });
}

export function reviveFighter(state: GameState, fighter: Fighter) {
  const charDef = CHARACTERS[fighter.charId];
  const battle = state.battle!;
  fighter.alive = true;
  fighter.hp = charDef.reviveHp;
  fighter.reviveAtSlot = null;
  fighter.pending = null;
  // Comes back exactly where the pawn was waiting — the marker is here now, so the walk loop picks
  // it up in this very visit and it declares straight away (§5.4 "ฟื้นแล้วประกาศได้เลย").
  fighter.slot = battle.marker;
  battle.log.push({ t: 'REVIVE', playerId: fighter.playerId, atSlot: battle.marker, hp: fighter.hp });
}

/** Payouts luna1 does not echo: its own entry (or it would recurse), and the two bonuses handed out
 *  by the rules rather than earned by a play — the Last Shot bonus and Aurelius's leftover-clock time
 *  bonus, the latter of which pays all four players at once and would hand Luna three free points at
 *  the buzzer. */
const LUNA1_IGNORES = ['luna1', LAST_SHOT_CONDITION_ID, 'timeBonus'];

export function pushScore(state: GameState, entry: Omit<ScoreEntry, 'atSlot' | 'bossId'>) {
  const battle = state.battle!;
  const full: ScoreEntry = { ...entry, atSlot: battle.marker, bossId: battle.bossId };
  state.scoreLog.push(full);
  battle.log.push({ t: 'SCORE', entry: full });

  // luna1 (v0.3.15): Luna scores 1 whenever anybody else does. It hangs off pushScore rather than
  // off any one trigger because that is literally the condition — every other character's payout is
  // her payout too. Guarded against recursing on its own entry, and against paying her for the
  // shared bonuses (Last Shot, the leftover-clock time bonus), which are not anyone's *play*: they
  // are handed out by the rules, and counting them would pay her three extra points at the buzzer
  // for having done nothing.
  if (LUNA1_IGNORES.includes(entry.conditionId)) return;
  const luna = state.players.find((p) => p.charId === 'Luna');
  if (!luna || luna.id === entry.playerId) return;
  battle.allyScoresForLuna += 1;
  if (battle.allyScoresForLuna % LUNA1_ALLY_SCORES_PER_POINT !== 0) return;
  pushScore(state, { playerId: luna.id, conditionId: 'luna1', points: scorePoints('luna1') });
}

export function currentTotalScore(state: GameState, playerId: number): number {
  return state.scoreLog.filter((e) => e.playerId === playerId).reduce((sum, e) => sum + e.points, 0);
}

export function bossArmorFor(bossId: string) {
  return BOSSES[bossId as keyof typeof BOSSES]?.armor ?? 0;
}
