// Public engine API surface — v0.3.0 "clock" ruleset. Everything in this game is open information
// (GAME_DESIGN_v0_3_0.md §4.4: "นี่คือหัวใจ ไม่ใช่ทางเลือก") so, unlike v0.2.0, there is no
// redactStateFor() gate — agents (human UI and bots alike) just read GameState directly.

export * from './clock/types';
export { createRNG, rngFromState } from './rng';
export type { RNG } from './rng';
export { newGame, runDraft, prepareBattle } from './clock/setup';
export { playGame } from './clock/game';
export { runClockBattle, resetFighterForNewBattle, resolveOrderCompare } from './clock/walk';
export {
  applySomnivarTax,
  declareSkill,
  legalTrapSlots,
  resolveFighterPending,
  processTrapsAtMarker,
  dealDamageToFighterFromBoss,
  applyBossDamageToFighter,
  redirectTarget,
  resolveQueuedCounter,
} from './clock/skills';
export { declareBossAction, resolveBossPending, bossMoveTargets } from './clock/bossAI';
export { pickExtreme, pickExtremeN } from './clock/rank';
export { currentTotalScore, pushScore, applyDamageToFighter, applyDamageToBoss, healFighter, killFighter, reviveFighter } from './clock/damage';
export { determineWinner, grantEndOfBattleRewards, onBattleEndScoring, onPlayerDealtDamage, onWeakPointOpened, onTrapTriggered, onHealResolved } from './clock/scoring';
export type { NewGameSetup } from './clock/setup';
export type { FinalScores } from './clock/scoring';

export type { CharId, SkillId, SkillDef, SkillKind, CharacterDef, ScoreConditionDef } from '@content/characters';
export type { BossId, BossDef, BossMoveDef } from '@content/bosses3';
export type { Difficulty } from '@content/difficulty';
