import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';

export function MenuScreen() {
  const t = useT();
  const setScreen = useAppStore((s) => s.setScreen);
  const hasSave = useAppStore((s) => s.hasSave);
  const continueGame = useAppStore((s) => s.continueGame);

  return (
    <main className="menu-hero min-h-screen flex items-center justify-center p-5 sm:p-8">
      <div className="menu-atmosphere" aria-hidden="true" />

      <section className="menu-sanctum relative z-10 w-full max-w-md px-6 py-8 sm:px-10 sm:py-10">
        <div className="text-center mb-8">
          <div className="menu-moon-sigil" aria-hidden="true">
            <span>☾</span>
          </div>
          <p className="menu-kicker font-display">THE CLOCK OF DOOM</p>
          <h1 className="menu-title text-4xl sm:text-5xl font-display tracking-widest">{t('app.title')}</h1>
          <div className="menu-divider" aria-hidden="true"><span>◆</span></div>
          <p className="menu-subtitle mt-3">{t('menu.subtitle')}</p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <MenuButton primary onClick={() => setScreen('setup')}>{t('menu.newGame')}</MenuButton>
          {hasSave && <MenuButton onClick={continueGame}>{t('menu.continue')}</MenuButton>}
          <MenuButton onClick={() => setScreen('tutorial')}>{t('menu.tutorial')}</MenuButton>
          <MenuButton onClick={() => setScreen('stats')}>{t('menu.stats')}</MenuButton>
          <MenuButton onClick={() => setScreen('settings')}>{t('menu.settings')}</MenuButton>
        </div>
      </section>
    </main>
  );
}

function MenuButton({ children, onClick, primary = false }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className={`menu-button ${primary ? 'menu-button-primary' : ''} py-3 text-lg font-display`}>
      <span aria-hidden="true">◇</span>
      <span>{children}</span>
      <span aria-hidden="true">◇</span>
    </button>
  );
}
