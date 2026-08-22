import { useAppStore } from '@session/store';
import { MenuScreen } from '@ui/screens/MenuScreen';
import { SetupScreen } from '@ui/screens/SetupScreen';
import { GameScreen } from '@ui/screens/GameScreen';
import { ScoringScreen } from '@ui/screens/ScoringScreen';
import { AllLoseScreen } from '@ui/screens/AllLoseScreen';
import { TutorialScreen } from '@ui/screens/TutorialScreen';
import { StatsScreen } from '@ui/screens/StatsScreen';
import { SettingsScreen } from '@ui/screens/SettingsScreen';
import { useBattleMusic } from '@ui/audio/useBattleMusic';
import { useSessionVersion } from '@session/useSession';

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
      return <ScoringScreen />;
    case 'allLose':
      return <AllLoseScreen />;
    case 'tutorial':
      return <TutorialScreen />;
    case 'stats':
      return <StatsScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <MenuScreen />;
  }
}
