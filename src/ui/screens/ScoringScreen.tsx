import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';
import { sceneImageUrl } from '@ui/common/assets';
import { BattleSummaryPanel } from '@ui/panels/BattleSummaryPanel';

export function ScoringScreen() {
  const t = useT();
  const session = useAppStore((s) => s.session);
  const setScreen = useAppStore((s) => s.setScreen);
  if (!session?.state.gameOver || session.state.gameOver.outcome !== 'win') return null;
  const { totals, winnerId, tieBreak } = session.state.gameOver;
  const players = session.state.players;

  return (
    // Scrolls internally: #root is height:100%, so a taller-than-viewport page would otherwise
    // strand the buttons off-screen with no document scrollbar to reach them.
    <div className="relative h-screen overflow-y-auto">
      {/* Backdrop pinned to the viewport so the summary panel can make the content taller than one
          screen without the art stretching or scrolling away. */}
      <div
        className="fixed inset-0"
        style={{ backgroundImage: `url(${sceneImageUrl()})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-black/65 via-black/30 to-black/75" />
      <div className="fixed inset-0 victory-glow" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-3xl font-display gold-text drop-shadow-[0_0_14px_rgba(240,210,122,0.65)]">{t('scoring.title')}</h2>
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

        <BattleSummaryPanel state={session.state} tone="win" />

        <div className="flex gap-3">
          <button onClick={() => setScreen('setup')} className="gold-frame rounded-lg px-6 py-2 hover:bg-gold/10">
            {t('scoring.playAgain')}
          </button>
          <button onClick={() => setScreen('menu')} className="gold-frame rounded-lg px-6 py-2 hover:bg-gold/10">
            {t('scoring.backToMenu')}
          </button>
        </div>
      </div>
    </div>
  );
}
