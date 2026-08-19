import { useState } from 'react';
import { useAppStore } from '@session/store';
import { useSessionVersion } from '@session/useSession';
import { useT } from '@content/i18n/useT';
import { TimelineBar } from '@ui/clock/TimelineBar';
import { BossFigure } from '@ui/clock/BossFigure';
import { HeroFigures } from '@ui/clock/HeroFigures';
import { PartyStatBar } from '@ui/clock/PartyStatBar';
import { ActionBanner } from '@ui/panels/ActionBanner';
import { ActionFlash } from '@ui/panels/ActionFlash';
import { BattleResultModal } from '@ui/panels/BattleResultModal';
import { BossDetailModal } from '@ui/panels/BossDetailModal';
import { HeroDetailModal } from '@ui/panels/HeroDetailModal';
import { DecisionPanel } from '@ui/panels/DecisionPanel';
import { LogPanel } from '@ui/panels/LogPanel';
import { sceneImageUrl } from '@ui/common/assets';
import { useGameAudio } from '@ui/audio/useGameAudio';

type Detail = { kind: 'boss' } | { kind: 'hero'; playerId: number } | null;

export function GameScreen() {
  const t = useT();
  const session = useAppStore((s) => s.session);
  const setScreen = useAppStore((s) => s.setScreen);
  const visualMode = useAppStore((s) => s.settings.visualMode);
  const [detail, setDetail] = useState<Detail>(null);
  useSessionVersion(session);
  useGameAudio(session);

  if (!session) return null;
  const state = session.state;

  const pending = state.pending;
  const isHumanTurn = pending != null && session.humanAgents.has(pending.playerId);
  // Level-up belongs to the end-of-battle popup, not the bottom command bar.
  const expInPopup = pending?.kind === 'PLACE_EXP' && isHumanTurn;
  // Everything on the battle stage renders from the paced display copy, never live engine state —
  // see session/playback.ts for why.
  const shown = session.displayBattle;

  return (
    // Locked to the viewport on desktop so the action buttons are always reachable without
    // scrolling; the stage is the only flexible row and gives up height to the fixed panels.
    <div className={`game-screen visual-${visualMode} md:h-screen md:overflow-y-auto flex flex-col gap-2 p-2`}>
      <div className="game-topbar flex items-center justify-between flex-shrink-0">
        <div className="text-sm gold-text font-display">{t('game.bossOf', { i: state.bossIndex + 1 })}</div>
        <div className="flex gap-2">
          <button onClick={() => setScreen('settings')} className="text-xs text-gold-dim underline">
            {t('game.settings')}
          </button>
          <button onClick={() => setScreen('menu')} className="text-xs text-gold-dim underline">
            {t('game.giveUp')}
          </button>
        </div>
      </div>

      {state.phase === 'DRAFT' && (
        <div className="flex flex-col items-center gap-3 mt-6">
          <h2 className="text-2xl font-display gold-text">{t('draft.title')}</h2>
          <p className="text-xs text-gold-dim max-w-md text-center">{t('draft.subtitle')}</p>
          {pending && pending.kind === 'CHOOSE_CHARACTER' && !isHumanTurn && (
            <div className="text-sm text-gold-dim">{t('draft.waitingFor', { name: state.players.find((p) => p.id === pending.playerId)?.name ?? '' })}</div>
          )}
          {pending && isHumanTurn && <DecisionPanel state={state} decision={pending} session={session} />}
        </div>
      )}

      {shown && state.phase !== 'DRAFT' && (
        <>
          {/* Battle stage — the only row that flexes. */}
          <div
            className="battle-stage relative w-full flex-1 min-h-[320px] sm:min-h-[340px] md:min-h-[380px] rounded-lg overflow-hidden gold-frame flex-shrink"
            // Sizing must be inline: `.gold-frame` uses the `background` shorthand, which resets
            // background-size/position and would otherwise beat the bg-cover/bg-center utilities,
            // leaving the backdrop pinned at natural size in the top-left corner.
            style={{ backgroundImage: `url(${sceneImageUrl(shown.bossId)})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          >
            <div className="battle-stage-shade absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/35" />

            <div className="absolute inset-0 p-2">
              <div className="w-[38%] sm:w-[34%] h-full">
                <BossFigure
                  battle={shown}
                  popups={session.popups.filter((p) => p.target === 'boss')}
                  actionFlash={session.actionFlash}
                  onSelect={() => setDetail({ kind: 'boss' })}
                />
              </div>
              {/* Four equal vertical slots keep the party in a top-to-bottom front line without
                  letting large sprite frames overlap on portrait phones. */}
              <div className="hero-line absolute right-2 top-2 bottom-2 w-[34%] sm:w-[28%]">
                <HeroFigures state={state} battle={shown} popups={session.popups} actionFlash={session.actionFlash} onSelect={(playerId) => setDetail({ kind: 'hero', playerId })} />
              </div>
            </div>

            <ActionFlash flash={session.actionFlash} bossId={shown.bossId} />
          </div>

          <div className="timeline-dock flex-shrink-0">
            <TimelineBar state={state} battle={shown} />
          </div>

          <div className="banner-dock flex-shrink-0">
            <ActionBanner state={state} event={session.currentEvent} />
          </div>

          {/* Bottom battle bar: commands · party stats · log, all on one row so nothing needs
              scrolling to reach. */}
          <div className="battle-console flex-shrink-0 flex flex-col md:flex-row gap-2 md:h-[170px]">
            <div className="command-dock md:w-[34%] md:h-full md:overflow-y-auto">
              {pending && !expInPopup ? (
                isHumanTurn ? (
                  <DecisionPanel state={state} decision={pending} session={session} />
                ) : (
                  <div className="gold-frame rounded-lg h-full flex items-center justify-center text-xs text-gold-dim px-3 py-4">
                    {t('game.thinking', { name: state.players.find((p) => p.id === pending.playerId)?.name ?? '' })}
                  </div>
                )
              ) : (
                <div className="gold-frame rounded-lg h-full min-h-[60px]" />
              )}
            </div>
            <div className="party-dock md:w-[38%] md:h-full">
              <PartyStatBar state={state} battle={shown} scoreOf={(id) => session.displayScoreFor(id)} onSelect={(id) => setDetail({ kind: 'hero', playerId: id })} />
            </div>
            <div className="log-dock flex-1 h-[120px] md:h-full">
              <LogPanel log={session.visibleLog} />
            </div>
          </div>

          {session.battleResult && (
            <BattleResultModal state={state} battle={shown} session={session}>
              {session.battleResult.acknowledged && expInPopup && pending ? (
                <DecisionPanel state={state} decision={pending} session={session} />
              ) : null}
            </BattleResultModal>
          )}

          {detail?.kind === 'boss' && <BossDetailModal battle={shown} onClose={() => setDetail(null)} />}
          {detail?.kind === 'hero' && (
            <HeroDetailModal state={state} battle={shown} playerId={detail.playerId} onClose={() => setDetail(null)} />
          )}
        </>
      )}
    </div>
  );
}
