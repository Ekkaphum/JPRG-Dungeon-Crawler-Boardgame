// Public engine API surface — v0.3.0 "clock" ruleset. Everything in this game is open information
// (GAME_DESIGN_v0_3_0.md §4.4: "นี่คือหัวใจ ไม่ใช่ทางเลือก") so, unlike v0.2.0, there is no
// redactStateFor() gate — agents (human UI and bots alike) just read GameState directly.

export * from './clock/types';
export { createRNG, rngFromState } from './rng';
export type { RNG } from './rng';
export { newGame, runDraft, prepareBattle, draftPoolFor } from './clock/setup';
export { playGame } from './clock/game';
export { runClockBattle, resetFighterForNewBattle, resolveOrderCompare } from './clock/walk';
export {
  applySomnivarTax,
  effectiveDeclareTime,
  WEAK_POINT_SLOTS,
  declareSkill,
  legalTrapSlots,
  resolveFighterPending,
  processTrapsAtMarker,
  springTrapOnBoss,
  processScheduledHitsAtMarker,
  expireTimedEffectsAtMarker,
  dealDamageToFighterFromBoss,
  applyBossDamageToFighter,
  redirectTarget,
  resolveQueuedCounter,
} from './clock/skills';
export { declareBossAction, applyBossMove } from './clock/bossAI';
export {
  FRACTURE_PCTS,
  FRACTURE_GEM_DISCOUNT,
  fractureHpAt,
  fractureGemsAreSpendable,
  rollFractures,
  crossFractures,
  owedFractures,
  claimFracture,
  settleUnclaimedFractures,
} from './clock/fracture';
export type { OwedFracture } from './clock/fracture';
export { pickExtreme, pickExtremeN } from './clock/rank';
export { currentTotalScore, pushScore, applyDamageToFighter, applyDamageToBoss, healFighter, killFighter, reviveFighter } from './clock/damage';
export {
  determineWinner,
  grantEndOfBattleRewards,
  onBattleEndScoring,
  onPlayerDealtDamage,
  onWeakPointOpened,
  onTrapTriggered,
  onHealResolved,
  onGuardRedirected,
} from './clock/scoring';
export type { NewGameSetup } from './clock/setup';
export type { FinalScores } from './clock/scoring';

export type { CharId, SkillId, SkillDef, SkillKind, CharacterDef, ScoreConditionDef } from '@content/characters';
export type { BossId, BossDef, BossMoveDef, BossSeries, BossAppearance, BossPhase2Def } from '@content/bosses';
export {
  BOSSES,
  ALL_BOSS_IDS,
  CLASSIC_BOSS_IDS,
  SINS_BOSS_IDS,
  CHESS_BOSS_IDS,
  LONG_RUN_BOSS_COUNT,
  bossMoves,
  bossAppearance,
  bossDisplayName,
  hpForAct,
  rollBossMove,
} from '@content/bosses';
export type { Difficulty } from '@content/difficulty';
