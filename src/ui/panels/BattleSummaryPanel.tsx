import type { GameState } from '@engine/index';
import { CLASS_COLOR } from '@content/charColors';
import { useT } from '@content/i18n/useT';
import { summarizeBattle } from '@session/battleSummary';

/** End-of-game breakdown of the final battle: how much boss HP was left, and who contributed what.
 *  Shown on both end screens so a loss answers "how close were we?" instead of just "you lost". */
export function BattleSummaryPanel({ state, tone }: { state: GameState; tone: 'win' | 'lose' }) {
  const t = useT();
  const battle = state.battle;
  if (!battle) return null;

  const summary = summarizeBattle(battle);
  const maxDamage = Math.max(1, ...summary.contributions.map((c) => c.damageToBoss));
  const hpPct = Math.round((summary.bossHpRemaining / summary.bossHpMax) * 100);
  const accent = tone === 'win' ? 'var(--gold-bright)' : 'var(--boss-red)';

  return (
    <div className="gold-frame rounded-lg p-4 w-full max-w-md space-y-4">
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-xs gold-text">{t('summary.bossHpLeft')}</span>
          <span className="text-sm" style={{ color: accent }}>
            {summary.bossHpRemaining}/{summary.bossHpMax}
          </span>
        </div>
        <div className="h-2 rounded bg-black/50 overflow-hidden">
          <div className="h-full rounded transition-all" style={{ width: `${hpPct}%`, background: accent }} />
        </div>
        <div className="text-[11px] text-gold-dim mt-1">
          {summary.bossHpRemaining > 0
            ? t('summary.shortBy', { n: summary.bossHpRemaining, pct: hpPct })
            : t('summary.damageDealt', { n: summary.damageDealt })}
        </div>
      </div>

      <div>
        <div className="text-xs gold-text mb-2">{t('summary.contribution')}</div>
        <div className="space-y-2">
          {summary.contributions.map((c) => {
            const player = state.players.find((p) => p.id === c.playerId);
            if (!player) return null;
            return (
              <div key={c.playerId}>
                <div className="flex justify-between items-baseline text-xs">
                  <span>
                    {player.name} <span className="text-[10px] text-gold-dim">({player.charId})</span>
                  </span>
                  <span className="text-gold-bright tabular-nums">{c.damageToBoss}</span>
                </div>
                <div className="h-1.5 rounded bg-black/50 overflow-hidden mt-0.5">
                  <div
                    className="h-full rounded"
                    style={{ width: `${(c.damageToBoss / maxDamage) * 100}%`, background: CLASS_COLOR[player.charId] }}
                  />
                </div>
                <div className="text-[10px] text-gold-dim mt-0.5 flex gap-3">
                  <span>{t('summary.hits', { n: c.hits })}</span>
                  <span>{t('summary.biggest', { n: c.biggestHit })}</span>
                  {c.healingDone > 0 && <span>{t('summary.healed', { n: c.healingDone })}</span>}
                  {c.deaths > 0 && <span className="text-boss">{t('summary.died', { n: c.deaths })}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-[10px] text-gold-dim border-t border-gold-dim/20 pt-2">{t('summary.finalBattleOnly')}</div>
    </div>
  );
}
