import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';

export function StatsScreen() {
  const t = useT();
  const stats = useAppStore((s) => s.stats);
  const setScreen = useAppStore((s) => s.setScreen);
  const winRate = stats.gamesPlayed ? ((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(0) : '—';

  return (
    <div className="min-h-screen p-6 flex flex-col items-center gap-4">
      <h2 className="text-2xl font-display gold-text">{t('menu.stats')}</h2>
      <div className="gold-frame rounded-lg p-4 w-full max-w-md text-sm space-y-3">
        <Row label="Games played" value={stats.gamesPlayed} />
        <Row label="Games won" value={stats.gamesWon} />
        <Row label="Win rate" value={`${winRate}%`} />
        <div>
          <div className="gold-text mb-1">Bosses defeated</div>
          <div className="text-gold-dim text-xs">
            {Object.entries(stats.bossesDefeated)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ') || '—'}
          </div>
        </div>
        <div>
          <div className="gold-text mb-1">Last Shots landed</div>
          <div className="text-gold-dim text-xs">
            {Object.entries(stats.charLastShots)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ') || '—'}
          </div>
        </div>
        <div>
          <div className="gold-text mb-1">Character deaths</div>
          <div className="text-gold-dim text-xs">
            {Object.entries(stats.charDeaths)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ') || '—'}
          </div>
        </div>
      </div>
      <button onClick={() => setScreen('menu')} className="gold-frame rounded-lg px-6 py-2 hover:bg-gold/10">
        {t('common.back')}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between border-b border-gold-dim/20 pb-1">
      <span className="text-gold-dim">{label}</span>
      <span>{value}</span>
    </div>
  );
}
