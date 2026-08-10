// Central damage/heal pipeline — every skill and boss move funnels through these so the buff/armor/
// rage/death rules in docs/10-v0.3.0-rulings.md §6 apply uniformly instead of being reimplemented
// per skill.

import { BOSSES } from '@content/bosses3';
import { CHARACTERS, type SkillId } from '@content/characters';
import type { BattleState, Fighter, GameState, ScoreEntry } from './types';

/** Outgoing damage a player deals to the boss: base + party Blessing atk buff + weak-point bonus.
 *  "ทุกคน" buffs never apply to the boss (GAME_DESIGN_v0_3_0.md §5.1) so this is player-only. */
export function computeOutgoingPlayerDamage(battle: BattleState, base: number): number {
  let dmg = base;
  if (battle.partyBuff) dmg += battle.partyBuff.atk;
  if (battle.weakPointActive) dmg += 4;
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
  opts: { ignoresArmor: boolean; skillId: SkillId }
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

  const fighter = battle.fighters.find((f) => f.playerId === attackerId);
  if (fighter) fighter.attackCountThisBattle += 1;

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
  const battle = state.battle!;
  fighter.alive = false;
  fighter.everDiedThisBattle = true;
  state.deathCounts[fighter.playerId] = (state.deathCounts[fighter.playerId] ?? 0) + 1;
  fighter.pending = null;
  fighter.shield = null;
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
