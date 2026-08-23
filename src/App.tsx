import { Suspense, lazy } from 'react';
import { useAppStore } from '@session/store';
import { MenuScreen } from '@ui/screens/MenuScreen';
import { SetupScreen } from '@ui/screens/SetupScreen';
import { GameScreen } from '@ui/screens/GameScreen';
import { useBattleMusic } from '@ui/audio/useBattleMusic';
import { useSessionVersion } from '@session/useSession';

// Menu → Setup → Game is the path every session walks, so those three stay in the entry chunk and
// keep loading exactly as before. The rest are split out: the rulebook and the stats screen are
// each opened by a minority of sessions, and scoring/all-lose cannot be reached until a whole
// battle has been played — by which time their chunk has long since been fetched in the background.
// Nothing here changes behaviour; it only moves code out of the bundle that blocks first paint.
const ScoringScreen = lazy(() => import('@ui/screens/ScoringScreen').then((m) => ({ default: m.ScoringScreen })));
const AllLoseScreen = lazy(() => import('@ui/screens/AllLoseScreen').then((m) => ({ default: m.AllLoseScreen })));
const TutorialScreen = lazy(() => import('@ui/screens/TutorialScreen').then((m) => ({ default: m.TutorialScreen })));
const StatsScreen = lazy(() => import('@ui/screens/StatsScreen').then((m) => ({ default: m.StatsScreen })));
const SettingsScreen = lazy(() => import('@ui/screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));

/** Shown only while a split chunk is in flight — on a local or warm connection this is typically
 *  never painted. Deliberately plain: a spinner that flashes for 40ms reads as a glitch. */
function ScreenFallback() {
  return <div className="min-h-screen" />;
}

export default function App() {
  const screen = useAppStore((s) => s.screen);
  // Music is owned here rather than by GameScreen so it survives navigating to the settings screen —
  // the volume slider lives there, and cutting the track on the way in would leave it deaf.
  //
  // The phase has to come off a session subscription, not a zustand selector: the session mutates
  // its GameState in place and only bumps its own version counter, so a selector reading
  // `s.session?.state.phase` would never re-run and the music would never start.
  const session = useAppStore((s) => s.session);
  useSessionVersion(session);
  useBattleMusic(session?.state.phase, screen);

  switch (screen) {
    case 'menu':
      return <MenuScreen />;
    case 'setup':
      return <SetupScreen />;
    case 'game':
      return <GameScreen />;
    case 'scoring':
      return (
        <Suspense fallback={<ScreenFallback />}>
          <ScoringScreen />
        </Suspense>
      );
    case 'allLose':
      return (
        <Suspense fallback={<ScreenFallback />}>
          <AllLoseScreen />
        </Suspense>
      );
    case 'tutorial':
      return (
        <Suspense fallback={<ScreenFallback />}>
          <TutorialScreen />
        </Suspense>
      );
    case 'stats':
      return (
        <Suspense fallback={<ScreenFallback />}>
          <StatsScreen />
        </Suspense>
      );
    case 'settings':
      return (
        <Suspense fallback={<ScreenFallback />}>
          <SettingsScreen />
        </Suspense>
      );
    default:
      return <MenuScreen />;
  }
}
