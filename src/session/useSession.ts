import { useSyncExternalStore } from 'react';
import type { GameSession } from './GameSession';

/** Re-renders whenever the session's mutable engine state changes. docs/02 §3 */
export function useSessionVersion(session: GameSession | null): number {
  return useSyncExternalStore(
    (cb) => (session ? session.subscribe(cb) : () => {}),
    () => (session ? session.version : 0)
  );
}
