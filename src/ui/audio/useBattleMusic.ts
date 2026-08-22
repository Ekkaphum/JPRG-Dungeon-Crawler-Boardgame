import { useEffect } from 'react';
import type { Phase } from '@engine/index';
import type { Screen } from '@session/store';
import { musicPlayer } from './MusicPlayer';

/** The battle scene proper — draft and camp get quiet, everything from the boss intro through the
 *  end-of-battle reveal gets the loop.
 *
 *  Takes the screen as well as the phase because the settings screen is reachable *from* a running
 *  battle, and that is where the music volume slider lives: cutting the music the moment someone
 *  opens settings would leave them adjusting a slider they cannot hear. Settings therefore counts
 *  as "still in the battle scene"; the menu, scoring and all-lose screens do not, so backing out to
 *  any of those stops the loop even though the abandoned session's phase never changes.
 *
 *  Exported bare so the mapping is testable without touching an audio element. */
export function isBattleScenePhase(phase: Phase | undefined, screen: Screen): boolean {
  if (screen !== 'game' && screen !== 'settings') return false;
  return phase === 'BATTLE_INTRO' || phase === 'CLOCK_RUN' || phase === 'BATTLE_END';
}

/** Starts/stops the looping battle theme as the session moves in and out of the battle scene.
 *  Lives at the App level rather than inside GameScreen so that navigating between screens does not
 *  unmount it — see isBattleScenePhase for why that matters. */
export function useBattleMusic(phase: Phase | undefined, screen: Screen) {
  useEffect(() => {
    if (isBattleScenePhase(phase, screen)) musicPlayer.play();
    else musicPlayer.stop();
  }, [phase, screen]);
}
