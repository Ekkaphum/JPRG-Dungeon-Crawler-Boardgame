import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';

export function MenuScreen() {
  const t = useT();
  const setScreen = useAppStore((s) => s.setScreen);
  const hasSave = useAppStore((s) => s.hasSave);
  const continueGame = useAppStore((s) => s.continueGame);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-display gold-text tracking-widest">{t('app.title')}</h1>
        <p className="text-gold-dim mt-2">{t('menu.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <MenuButton onClick={() => setScreen('setup')}>{t('menu.newGame')}</MenuButton>
        {hasSave && <MenuButton onClick={continueGame}>{t('menu.continue')}</MenuButton>}
        <MenuButton onClick={() => setScreen('tutorial')}>{t('menu.tutorial')}</MenuButton>
        <MenuButton onClick={() => setScreen('stats')}>{t('menu.stats')}</MenuButton>
        <MenuButton onClick={() => setScreen('settings')}>{t('menu.settings')}</MenuButton>
      </div>
    </div>
  );
}

function MenuButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="gold-frame rounded-lg py-3 text-lg font-display hover:bg-gold/10 transition-colors">
      {children}
    </button>
  );
}
