import { hasCamp } from '@content/rulesets';
import { gemsForBattle } from '@engine/clock/camp';
import type { ReactNode } from 'react';
import type { BattleState, GameState } from '@engine/index';
import { BOSSES } from '@content/bosses';
import { charImageUrl } from '@ui/common/assets';
import { Modal } from '@ui/common/Modal';
import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';
import type { GameSession } from '@session/GameSession';
import { BossPortrait } from '@ui/common/BossPortrait';

/** Shown the moment a battle ends: who won, who landed the finishing blow, who survived, and what
 *  the party earned. The engine is parked until this is acknowledged; after that the level-up step
 *  renders inside the same popup via `children`. */
export function BattleResultModal({
  state,
  battle,
  session,
  children,
}: {
  state: GameState;
  battle: BattleState;
  session: GameSession;
  children?: ReactNode;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const result = session.battleResult!;
  const def = BOSSES[result.bossId];
  const won = result.outcome === 'boss_defeated';
  const partyWiped = result.outcome === 'party_wiped';
  const reward = Math.floor(result.markerLeft / 2);
  const killer = result.finishedBy != null ? state.players.find((p) => p.id === result.finishedBy) : null;

  return (
    <Modal title={won ? t('result.win', { boss: def.name[lang] }) : t(partyWiped ? 'result.losePartyWiped' : 'result.lose')} onClose={() => {}}>
      <div className="flex gap-3">
        <BossPortrait bossId={result.bossId} grayscale={won} className="w-24 h-32 rounded gold-frame flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className={`text-lg font-display ${won ? 'popup-heal' : 'text-boss'}`}>{won ? t('result.winTag') : t('result.loseTag')}</div>
          <div className="text-xs text-gold-dim mt-1">
            {def.name[lang]} · {def.sin[lang]}
          </div>
          {won ? (
            <>
              {killer && (
                <div className="text-xs mt-2">
                  <span className="text-gold-dim">{t('result.lastShot')}: </span>
                  <span className="text-gold-bright">{killer.name}</span>
                </div>
              )}
              <div className="text-xs text-gold-dim mt-1">{t('result.timeLeft', { n: result.markerLeft })}</div>
              <div className="text-xs text-gold-bright mt-1">
                {result.isLastBoss
                  ? t('game.battleEnd.pointsGranted', { n: reward })
                  : hasCamp(state.ruleset)
                    ? t('game.battleEnd.gemsGranted', { n: gemsForBattle(state) })
                    : t('game.battleEnd.expGranted', { n: reward })}
              </div>
            </>
          ) : (
            <div className="text-xs text-gold-dim mt-2 leading-snug">{t(partyWiped ? 'allLose.messagePartyWiped' : 'allLose.message')}</div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs font-display gold-text border-b border-gold-dim/30 pb-1 mb-2">{t('result.party')}</div>
        <div className="grid grid-cols-2 gap-1.5">
          {state.players.map((p) => {
            const f = battle.fighters.find((x) => x.playerId === p.id)!;
            return (
              <div key={p.id} className={`flex items-center gap-2 rounded px-1.5 py-1 border border-gold-dim/25 ${f.alive ? '' : 'opacity-50'}`}>
                <img src={charImageUrl(p.charId)} alt={p.charId} className="w-6 h-6 object-cover object-top rounded flex-shrink-0" draggable={false} />
                <span className="text-[11px] gold-text truncate flex-1">{p.name}</span>
                <span className={`text-[10px] font-mono flex-shrink-0 ${f.alive ? 'text-gold-bright' : 'text-boss'}`}>
                  {f.alive ? `${f.hp}/${f.maxHp}` : '💀'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {children ? (
        <div className="mt-4">{children}</div>
      ) : (
        <button
          onClick={() => session.acknowledgeBattleResult()}
          className="w-full mt-4 gold-frame rounded-lg py-2 font-display hover:bg-gold/10 transition-colors"
        >
          {t('game.battleEnd.continue')}
        </button>
      )}
    </Modal>
  );
}
