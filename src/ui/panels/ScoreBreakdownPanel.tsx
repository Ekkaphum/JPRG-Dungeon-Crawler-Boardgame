import type { GameState } from '@engine/index';
import { BOSSES } from '@content/bosses3';
import { charScore } from '@content/characters';
import { CLASS_COLOR } from '@content/charColors';
import { useT } from '@content/i18n/useT';
import { useAppStore } from '@session/store';
import { buildScoreBreakdown } from '@session/scoreBreakdown';

export function ScoreBreakdownPanel({ state }: { state: GameState }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const breakdown = buildScoreBreakdown(state);

  const conditionLabel = (playerId: number, conditionId: string) => {
    if (conditionId === 'timeBonus') return t('scoring.breakdown.timeBonus');
    const charId = state.players.find((player) => player.id === playerId)?.charId;
    const condition = charId ? charScore(charId, state.ruleset).find((row) => row.id === conditionId) : null;
    return condition?.desc[lang] ?? conditionId;
  };

  return (
    <section className="gold-frame rounded-lg p-4 w-full max-w-4xl">
      <div className="mb-4">
        <h3 className="font-display gold-text text-lg">{t('scoring.breakdown.title')}</h3>
        <p className="text-[11px] text-gold-dim mt-1">{t('scoring.breakdown.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {breakdown.map((playerScore) => {
          const player = state.players.find((candidate) => candidate.id === playerScore.playerId);
          if (!player) return null;
          return (
            <article key={player.id} className="rounded-md border border-gold-dim/25 bg-black/35 overflow-hidden">
              <header className="flex items-center justify-between px-3 py-2 border-b border-gold-dim/25 bg-black/25">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: CLASS_COLOR[player.charId] }} />
                  <span className="font-medium truncate">{player.name}</span>
                  <span className="text-[10px] text-gold-dim">{player.charId}</span>
                </div>
                <span className="font-display text-gold-bright tabular-nums">
                  {t('scoring.breakdown.total', { n: playerScore.total })}
                </span>
              </header>

              <div className="divide-y divide-gold-dim/15">
                {playerScore.bosses.length === 0 && (
                  <div className="px-3 py-4 text-xs text-gold-dim text-center">{t('scoring.breakdown.noScore')}</div>
                )}
                {playerScore.bosses.map((bossScore) => (
                  <div key={bossScore.bossId} className="px-3 py-2.5">
                    <div className="flex justify-between gap-3 text-xs mb-1.5">
                      <span className="gold-text truncate">{BOSSES[bossScore.bossId].name[lang]}</span>
                      <span className="text-gold-bright tabular-nums flex-shrink-0">+{bossScore.total}</span>
                    </div>
                    <div className="space-y-1">
                      {bossScore.conditions.map((condition) => (
                        <div key={condition.conditionId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-baseline text-[11px]">
                          <span className="text-gold-dim leading-snug" title={conditionLabel(player.id, condition.conditionId)}>
                            {conditionLabel(player.id, condition.conditionId)}
                          </span>
                          <span className="text-gold-dim tabular-nums">×{condition.count}</span>
                          <span className="text-gold-bright tabular-nums w-7 text-right">+{condition.points}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
