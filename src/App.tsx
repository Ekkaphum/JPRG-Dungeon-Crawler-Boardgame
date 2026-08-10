import { useAppStore } from '@session/store';
import { MenuScreen } from '@ui/screens/MenuScreen';
import { SetupScreen } from '@ui/screens/SetupScreen';
import { GameScreen } from '@ui/screens/GameScreen';
import { ScoringScreen } from '@ui/screens/ScoringScreen';
import { AllLoseScreen } from '@ui/screens/AllLoseScreen';
import { TutorialScreen } from '@ui/screens/TutorialScreen';
import { StatsScreen } from '@ui/screens/StatsScreen';
import { SettingsScreen } from '@ui/screens/SettingsScreen';

export default function App() {
  const screen = useAppStore((s) => s.screen);
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
