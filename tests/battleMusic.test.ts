import { describe, expect, it } from 'vitest';
import { isBattleScenePhase } from '@ui/audio/useBattleMusic';
import type { Phase } from '@engine/index';

describe('isBattleScenePhase', () => {
  it('plays through the boss intro, the clock, and the end-of-battle reveal', () => {
    expect(isBattleScenePhase('BATTLE_INTRO', 'game')).toBe(true);
    expect(isBattleScenePhase('CLOCK_RUN', 'game')).toBe(true);
    expect(isBattleScenePhase('BATTLE_END', 'game')).toBe(true);
  });

  it('goes quiet for the draft and the camp', () => {
    expect(isBattleScenePhase('DRAFT', 'game')).toBe(false);
    expect(isBattleScenePhase('CAMP', 'game')).toBe(false);
  });

  it('goes quiet for setup, scoring, and the all-lose ending, and when there is no session at all', () => {
    expect(isBattleScenePhase('SETUP', 'game')).toBe(false);
    expect(isBattleScenePhase('SCORING', 'game')).toBe(false);
    expect(isBattleScenePhase('ALL_LOSE', 'game')).toBe(false);
    expect(isBattleScenePhase(undefined, 'game')).toBe(false);
  });

  it('covers every Phase value with no silent fallthrough', () => {
    const all: Phase[] = ['SETUP', 'DRAFT', 'BATTLE_INTRO', 'CLOCK_RUN', 'BATTLE_END', 'CAMP', 'SCORING', 'ALL_LOSE'];
    expect(all.filter((p) => isBattleScenePhase(p, 'game'))).toEqual(['BATTLE_INTRO', 'CLOCK_RUN', 'BATTLE_END']);
  });

  it('keeps playing on the settings screen, where the volume slider lives', () => {
    expect(isBattleScenePhase('CLOCK_RUN', 'settings')).toBe(true);
    // Still only during a battle — opening settings from the menu stays silent.
    expect(isBattleScenePhase('CAMP', 'settings')).toBe(false);
    expect(isBattleScenePhase(undefined, 'settings')).toBe(false);
  });

  it('stops when the player backs out to a screen that is not the battle', () => {
    // The abandoned session keeps its CLOCK_RUN phase, so the screen is the only thing that can
    // tell the loop to stop here.
    for (const screen of ['menu', 'setup', 'scoring', 'allLose', 'tutorial', 'stats'] as const) {
      expect(isBattleScenePhase('CLOCK_RUN', screen), screen).toBe(false);
    }
  });
});
