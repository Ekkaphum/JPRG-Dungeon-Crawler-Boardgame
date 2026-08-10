import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';
import { BOSSES } from '@content/bosses3';
import { bossImageUrl } from '@ui/common/assets';

export function AllLoseScreen() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const session = useAppStore((s) => s.session);
  const setScreen = useAppStore((s) => s.setScreen);

  const over = session?.state.gameOver;
  const failedAt = over?.outcome === 'allLose' ? over.bossId : null;
  const cleared = session ? session.state.bossIndex : 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h2 className="text-3xl font-display text-boss">{t('allLose.title')}</h2>

      {failedAt && (
        <div className="gold-frame rounded-lg p-4 flex items-center gap-4 max-w-md">
          <img src={bossImageUrl(failedAt)} alt={failedAt} className="w-20 h-20 object-cover rounded flex-shrink-0" draggable={false} />
          <div className="min-w-0">
            <div className="font-display gold-text">{BOSSES[failedAt].name[lang]}</div>
            <div className="text-xs text-gold-dim">{BOSSES[failedAt].sin[lang]}</div>
            <div className="text-xs text-gold-dim mt-1">{t('allLose.progress', { n: cleared })}</div>
          </div>
        </div>
      )}

      <p className="text-gold-dim max-w-md text-center text-sm">{t('allLose.message')}</p>

      <div className="flex gap-3">
        <button onClick={() => setScreen('setup')} className="gold-frame rounded-lg px-6 py-2 hover:bg-gold/10">
          {t('scoring.playAgain')}
        </button>
        <button onClick={() => setScreen('menu')} className="gold-frame rounded-lg px-6 py-2 hover:bg-gold/10">
          {t('scoring.backToMenu')}
        </button>
      </div>
    </div>
  );
}
