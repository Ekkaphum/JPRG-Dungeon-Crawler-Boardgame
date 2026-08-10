import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';

export function ScoringScreen() {
  const t = useT();
  const session = useAppStore((s) => s.session);
  const setScreen = useAppStore((s) => s.setScreen);
  if (!session?.state.gameOver || session.state.gameOver.outcome !== 'win') return null;
  const { totals, winnerId, tieBreak } = session.state.gameOver;
  const players = session.state.players;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h2 className="text-3xl font-display gold-text">{t('scoring.title')}</h2>
      <div className="text-lg text-gold-bright">
        {t('scoring.winner')}: {players.find((p) => p.id === winnerId)?.name}{' '}
        <span className="text-xs text-gold-dim">{t(`scoring.tieBreak.${tieBreak}` as 'scoring.tieBreak.points')}</span>
      </div>

      <div className="gold-frame rounded-lg p-4 w-full max-w-md">
        <div className="flex justify-between text-xs text-gold-dim mb-2 px-1">
          <span>{t('setup.player')}</span>
          <span>{t('scoring.score')}</span>
        </div>
        {players
          .slice()
          .sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0))
          .map((p) => (
            <div key={p.id} className={`flex justify-between items-center py-2 border-t border-gold-dim/20 ${p.id === winnerId ? 'text-gold-bright' : ''}`}>
              <span>
                {p.name} <span className="text-[10px] text-gold-dim">({p.charId})</span>
              </span>
              <span className="font-bold w-10 text-right">{totals[p.id] ?? 0}</span>
            </div>
          ))}
      </div>

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
