// Central damage/heal pipeline — every skill and boss move funnels through these so the buff/armor/
// rage/death rules in docs/10-v0.3.0-rulings.md §6 apply uniformly instead of being reimplemented
// per skill.

import { BOSSES } from '@content/bosses3';
import { CHARACTERS, type SkillId } from '@content/characters';
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
  if (battle.weakPointActive) dmg += 4;
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
  if (opts.countsAsAttack ?? true) {
    const fighter = battle.fighters.find((f) => f.playerId === attackerId);
    if (fighter) fighter.attackCountThisBattle += 1;
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
export function applyDamageToFighter(state: GameState, fighter: Fighter, rawDamage: number): number {
  // An AoE resolves one target at a time. Guard can redirect an earlier target's share onto Eric
  // and kill him before the loop reaches Eric's own share; that later share must not kill/log/count
  // the same fighter again.
  if (!fighter.alive) return 0;
  const battle = state.battle!;
  let dmg = rawDamage;
  if (battle.partyBuff) dmg -= battle.partyBuff.dmgReduction;
  if (fighter.shield?.kind === 'mana') dmg -= fighter.shield.reduction;
  if (fighter.shield?.kind === 'counter') {
    dmg = Math.floor(dmg * (1 - fighter.shield.reduction / 100));
    fighter.shield.hitDuringWindow = true;
  }
  dmg = Math.max(0, dmg);
  fighter.hp = Math.max(0, fighter.hp - dmg);
  // Latched, never cleared until the next battle — matt3 asks whether he *was* beaten down at any
  // point, so a later heal must not undo it. Strictly below half, so exactly half doesn't count.
  if (fighter.hp * 2 < fighter.maxHp) fighter.everDroppedBelowHalfThisBattle = true;
  if (fighter.hp === 0) killFighter(state, fighter);
  return dmg;
}

/** Heals a fighter, capped at maxHp. Returns the actual amount restored (0 if already full or dead
 *  — callers use this to gate Luna's condition 1, which requires restoring >=1 HP to an injured
 *  target). */
export function healFighter(fighter: Fighter, amount: number): number {
  if (!fighter.alive) return 0;
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

export function pushScore(state: GameState, entry: Omit<ScoreEntry, 'atSlot' | 'bossId'>) {
  const battle = state.battle!;
  const full: ScoreEntry = { ...entry, atSlot: battle.marker, bossId: battle.bossId };
  state.scoreLog.push(full);
  battle.log.push({ t: 'SCORE', entry: full });
}

export function currentTotalScore(state: GameState, playerId: number): number {
  return state.scoreLog.filter((e) => e.playerId === playerId).reduce((sum, e) => sum + e.points, 0);
}

export function bossArmorFor(bossId: string) {
  return BOSSES[bossId as keyof typeof BOSSES]?.armor ?? 0;
}
