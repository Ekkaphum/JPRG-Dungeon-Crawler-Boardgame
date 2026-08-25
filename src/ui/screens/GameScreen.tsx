import { useState } from 'react';
import { useAppStore } from '@session/store';
import { useSessionVersion } from '@session/useSession';
import { useT } from '@content/i18n/useT';
import { TimelineBar } from '@ui/clock/TimelineBar';
import { BossFigure } from '@ui/clock/BossFigure';
import { HeroFigures, HERO_GROUP_MIN } from '@ui/clock/HeroFigures';
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
    <div className={`game-screen visual-${visualMode} md:h-screen md:overflow-y-auto flex flex-col gap-1.5 px-2 py-1.5`}>
      <div className="game-topbar flex items-center justify-between flex-shrink-0">
        <div className="text-sm gold-text font-display">{t('game.bossOf', { i: state.bossIndex + 1, n: state.bossQueue.length })}</div>
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

      {/* The battle-result popup has to survive the phase flip to CAMP — the engine sets that phase
          as soon as it yields the camp's first decision, but the session blocks on this modal being
          acknowledged before it hands that decision to anyone, so hiding it on phase deadlocks the
          game on a blank camp screen. It then has to get out of the way again: `battleResult` is not
          cleared until the *next* battle starts, so without the acknowledged check it would sit on
          top of the camp for the whole phase. */}
      {shown && session.battleResult && (state.phase !== 'CAMP' || !session.battleResult.acknowledged) && (
        <BattleResultModal state={state} battle={shown} session={session}>
          {session.battleResult.acknowledged && expInPopup && pending ? (
            <DecisionPanel state={state} decision={pending} session={session} />
          ) : null}
        </BattleResultModal>
      )}

      {state.phase === 'CAMP' && !session.revealingBattle && (
        // The camp gets its own full-width view rather than sitting under the battle stage: the
        // battle it follows is over, and leaving the corpse of the last fight on screen while people
        // shop reads as if the clock were still running. Gated on revealingBattle too: the engine can
        // flip to CAMP before the last battle's log/result has finished pacing onto screen (it races
        // ahead — see GameSession.revealingBattle), so switching on phase alone would cut the log and
        // the result popup off mid-animation.
        <div className="camp-stage">
          <div className="camp-stage__shade" />
          <div className="camp-stage__content">
            <div className="camp-title-lockup">
              <span className="camp-title-rune">✦</span>
              <h2 className="text-2xl font-display gold-text">{t('camp.title')}</h2>
              <span className="camp-title-rune">✦</span>
            </div>
            <div className="camp-phase-track">
              <span className={pending?.kind === 'CAMP_BUY' ? 'is-active' : ''}><b>Ⅰ</b>{t('camp.phaseBuy')}</span>
              <i />
              <span className={pending?.kind === 'CAMP_UPGRADE' ? 'is-active' : ''}><b>Ⅱ</b>{t('camp.phaseUpgrade')}</span>
              <i />
              <span className={pending?.kind === 'CAMP_VP' ? 'is-active' : ''}><b>Ⅲ</b>{t('camp.phaseVp')}</span>
            </div>
            {pending && !isHumanTurn && (
              <div className="camp-waiting gold-frame rounded-lg text-sm text-gold-dim">
                {t('draft.waitingFor', { name: state.players.find((p) => p.id === pending.playerId)?.name ?? '' })}
              </div>
            )}
            {pending && isHumanTurn && <DecisionPanel state={state} decision={pending} session={session} />}
          </div>
        </div>
      )}

      {shown && state.phase !== 'DRAFT' && (state.phase !== 'CAMP' || session.revealingBattle) && (
        <>
          {/* Desktop is split into a protected battle column and a full-height log rail. The main
              column deliberately keeps the pre-v0.4.3 stage sizing: it may make a short viewport
              scroll, but it never scales the four-character line below the height it needs. The
              command bar underneath it is sized the other way round: it is whatever height its
              content needs (min-h, not h) and never scrolls inside itself, because a scrollbar on
              the one panel you have to use every single turn is worse than a rare page scroll.
              What makes that affordable is the fixed four-across card row — see .skill-grid. */}
          <div className="battle-layout relative w-full flex flex-col md:flex-row gap-2 flex-shrink-0">
            <div className="battle-main min-w-0 flex-1 flex flex-col gap-1.5">
              <div
                className="battle-stage relative w-full flex-1 rounded-lg overflow-hidden gold-frame flex-shrink"
                style={{
                  backgroundImage: `url(${sceneImageUrl(shown.bossId)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  // Pre-v0.4.3 floor: four 80px sprites, their HP plates, and the stage insets.
                  minHeight: `max(${HERO_GROUP_MIN + 40}px, 46vh)`,
                }}
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
                  {/* Keep the pre-v0.4.3 centered column as well as its protected minimum height. */}
                  <div className="hero-line absolute right-2 top-2 bottom-2 w-[34%] sm:w-[28%] flex flex-col justify-center">
                    <HeroFigures state={state} battle={shown} popups={session.popups} actionFlash={session.actionFlash} onSelect={(playerId) => setDetail({ kind: 'hero', playerId })} />
                  </div>
                </div>

                <ActionFlash flash={session.actionFlash} bossId={shown.bossId} phase={shown.phase} />
              </div>

              <div className="timeline-dock flex-shrink-0">
                <TimelineBar state={state} battle={shown} />
              </div>

              <div className="banner-dock flex-shrink-0">
                <ActionBanner state={state} event={session.currentEvent} />
              </div>

              <div className="battle-console flex-shrink-0 flex flex-col md:flex-row gap-2 md:min-h-[150px]">
                <div className="command-dock md:w-[58%]">
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
                <div className="party-dock flex-1">
                  <PartyStatBar state={state} battle={shown} scoreOf={(id) => session.displayScoreFor(id)} onSelect={(id) => setDetail({ kind: 'hero', playerId: id })} />
                </div>
              </div>
            </div>

            {/* The log body is positioned inside this rail on desktop, so its growing content is
                never part of the battle row's intrinsic height calculation. The rail stretches only
                to the height established by battle-main; LogPanel scrolls anything beyond it. */}
            <div className="battle-log-dock relative overflow-hidden flex-shrink-0 min-h-[150px] max-h-[40vh] md:max-h-none md:min-h-0 md:self-stretch w-full md:w-[220px] lg:w-[280px]">
              <LogPanel log={session.visibleLog} />
            </div>
          </div>

          {detail?.kind === 'boss' && <BossDetailModal battle={shown} players={state.players} onClose={() => setDetail(null)} />}
          {detail?.kind === 'hero' && (
            <HeroDetailModal state={state} battle={shown} playerId={detail.playerId} onClose={() => setDetail(null)} />
          )}
        </>
      )}
    </div>
  );
}
