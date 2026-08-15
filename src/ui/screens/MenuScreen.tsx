import { useAppStore } from '@session/store';
import { SELECTABLE_VISUAL_MODES } from '@session/persistence';
import { useT } from '@content/i18n/useT';

export function MenuScreen() {
  const t = useT();
  const setScreen = useAppStore((s) => s.setScreen);
  const hasSave = useAppStore((s) => s.hasSave);
  const continueGame = useAppStore((s) => s.continueGame);
  const visualMode = useAppStore((s) => s.settings.visualMode);
  const updateSettings = useAppStore((s) => s.updateSettings);

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

        {/* Hidden entirely while only one mode is selectable — a picker with a single option is
            just noise. Board-game mode is frozen rather than deleted; see SELECTABLE_VISUAL_MODES
            in @session/persistence for how to bring it back. */}
        {SELECTABLE_VISUAL_MODES.length > 1 && (
          <div className="visual-mode-picker mb-5" aria-label={t('menu.visualMode')}>
            <div className="visual-mode-heading">{t('menu.visualMode')}</div>
            <div className="visual-mode-options">
              {SELECTABLE_VISUAL_MODES.includes('classic') && (
                <VisualModeButton
                  selected={visualMode === 'classic'}
                  icon="✦"
                  label={t('menu.visualMode.classic')}
                  hint={t('menu.visualMode.classicHint')}
                  onClick={() => updateSettings({ visualMode: 'classic' })}
                />
              )}
              {SELECTABLE_VISUAL_MODES.includes('tabletop') && (
                <VisualModeButton
                  selected={visualMode === 'tabletop'}
                  icon="♟"
                  label={t('menu.visualMode.tabletop')}
                  hint={t('menu.visualMode.tabletopHint')}
                  onClick={() => updateSettings({ visualMode: 'tabletop' })}
                />
              )}
            </div>
          </div>
        )}

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

function VisualModeButton({
  selected,
  icon,
  label,
  hint,
  onClick,
}: {
  selected: boolean;
  icon: string;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="visual-mode-option">
      <span className="visual-mode-icon" aria-hidden="true">{icon}</span>
      <span><strong>{label}</strong><small>{hint}</small></span>
      <span className="visual-mode-check" aria-hidden="true">{selected ? '◆' : '◇'}</span>
    </button>
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
