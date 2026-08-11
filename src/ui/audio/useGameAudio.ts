import { useEffect } from 'react';
import type { GameSession } from '@session/GameSession';
import { soundFor } from '@session/playback';
import { audioEngine } from './AudioEngine';

/** Wires a running session's paced event stream to the audio engine. One subscriber per session:
 *  GameSession.onEvent is a single callback slot, so mounting this twice for the same session
 *  would silently drop one of them — GameScreen is the only place a session is actually displayed,
 *  so that's a non-issue in practice, but it's why this hook owns the slot outright rather than
 *  layering listeners. */
export function useGameAudio(session: GameSession | null) {
  useEffect(() => {
    if (!session) return;
    session.onEvent = (ev) => {
      if (ev.t === 'MARKER_TICK') {
        audioEngine.tick(ev.marker);
        return;
      }
      const sound = soundFor(ev);
      if (sound) audioEngine.play(sound);
    };
    return () => {
      if (session.onEvent) session.onEvent = null;
    };
  }, [session]);
}
