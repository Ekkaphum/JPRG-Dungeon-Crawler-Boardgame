import { useState } from 'react';
import { effectiveDeclareTime, type Choice, type GameState, type PendingDecision, type SkillId } from '@engine/index';
import {
  CHARACTERS,
  CHAR_IDS,
  DEATH_COIL_HP_COST,
  SAND_PER_REWIND,
  SHADOW_PER_ASSASSINATE,
  SKILLS,
  SOULS_PER_DEATH_COIL,
  skillStats,
} from '@content/characters';
import { landSlotDisplay } from '@content/eventText';
import { BOSSES } from '@content/bosses3';
import { declareRoute } from './declareRouting';
import { useT } from '@content/i18n/useT';
import { useAppStore } from '@session/store';
import type { GameSession } from '@session/GameSession';

export function DecisionPanel({ state, decision, session }: { state: GameState; decision: PendingDecision; session: GameSession }) {
  if (decision.kind === 'CHOOSE_CHARACTER') return <ChooseCharacterPanel decision={decision} session={session} />;
  if (decision.kind === 'PLACE_EXP') return <PlaceExpPanel state={state} decision={decision} session={session} />;
  return <DeclareActionPanel state={state} decision={decision} session={session} />;
}

function ChooseCharacterPanel({ decision, session }: { decision: Extract<PendingDecision, { kind: 'CHOOSE_CHARACTER' }>; session: GameSession }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const player = session.state.players.find((p) => p.id === decision.playerId)!;
  return (
    <div className="decision-board gold-frame rounded-lg p-3">
      <div className="font-display gold-text mb-2">
        {t('draft.title')} — {player.name}
      </div>
      <div className="flex gap-2 flex-wrap">
        {decision.available.map((charId) => (
          <button
            key={charId}
            onClick={() => session.submitHumanChoice(decision.playerId, { kind: 'CHOOSE_CHARACTER', charId })}
            className="gold-frame rounded-lg px-4 py-2 hover:bg-gold/10"
          >
            <div className="font-display gold-text">{charId}</div>
            <div className="text-[10px] text-gold-dim">{CHARACTERS[charId].job[lang]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlaceExpPanel({ state, decision, session }: { state: GameState; decision: Extract<PendingDecision, { kind: 'PLACE_EXP' }>; session: GameSession }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const player = state.players.find((p) => p.id === decision.playerId)!;

  return (
    <div className="decision-board gold-frame rounded-lg p-3">
      <div className="font-display gold-text mb-1">
        {t('game.expPlacement.title')} — {player.name}
      </div>
      <div className="text-xs text-gold-dim mb-2">{t('game.expPlacement.banked', { n: decision.bankedExp })}</div>
      <div className="flex gap-2 flex-wrap">
        {decision.skills.map((skillId) => {
          const current = decision.expOnCard[skillId] ?? 0;
          const isLv2Already = current >= 3;
          return (
            <button
              key={skillId}
              disabled={isLv2Already}
              onClick={() => session.submitHumanChoice(decision.playerId, { kind: 'PLACE_EXP', allocations: [{ skillId, count: decision.bankedExp }] })}
              className="gold-frame rounded-lg px-3 py-2 hover:bg-gold/10 disabled:opacity-40"
            >
              <div className="text-sm">{SKILLS[skillId].name[lang]}</div>
              <div className="text-[10px] text-gold-dim">{isLv2Already ? t('game.expPlacement.flipped') : `${current}/3`}</div>
            </button>
          );
        })}
        <button
          onClick={() => session.submitHumanChoice(decision.playerId, { kind: 'PLACE_EXP', allocations: [] })}
          className="gold-frame rounded-lg px-3 py-2 text-xs text-gold-dim hover:bg-gold/10"
        >
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}

function DeclareActionPanel({
  state,
  decision,
  session,
}: {
  state: GameState;
  decision: Extract<PendingDecision, { kind: 'DECLARE_ACTION' }>;
  session: GameSession;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const [skillId, setSkillId] = useState<SkillId | null>(null);
  // chrono1's call on the boss's next move. Orthogonal to which card is played, so it is held here
  // and merged into whatever gets submitted rather than being a step inside one skill's flow.
  const [prediction, setPrediction] = useState<'A' | 'B' | 'C' | null>(null);
  const player = state.players.find((p) => p.id === decision.playerId)!;
  const def = CHARACTERS[decision.options.charId];
  const battle = state.battle!;
  const fighter = battle.fighters.find((f) => f.playerId === decision.playerId)!;
  const isLv2 = (sid: SkillId) => !!state.progress[decision.playerId]?.isLv2[sid];

  const submit = (choice: Choice) => {
    setSkillId(null);
    const withPrediction: Choice =
      prediction && choice.kind === 'DECLARE_ACTION' && player.charId === 'Chrono'
        ? { ...choice, predictedBossMove: prediction }
        : choice;
    setPrediction(null);
    session.submitHumanChoice(decision.playerId, withPrediction);
  };

  const skillKind = skillId ? SKILLS[skillId].kind : null;

  return (
    <div className="decision-board gold-frame rounded-lg p-3">
      <div className="font-display gold-text mb-2">{t('decision.declareTitle', { name: player.name })}</div>

      {/* Chrono only. The boss's move is the one piece of hidden information on the board since
          v0.3.14, and he is the only character paid for reading it — so the call rides along with
          whatever he declares this visit rather than costing him a card. */}
      {player.charId === 'Chrono' && (
        <div className="flex gap-2 flex-wrap items-center mb-2 text-xs">
          <span className="text-gold-dim">{t('decision.predictBossMove')}</span>
          {(['A', 'B', 'C'] as const).map((k) => {
            const move = BOSSES[battle.bossId].moves.find((m) => m.key === k)!;
            return (
              <button
                key={k}
                onClick={() => setPrediction(prediction === k ? null : k)}
                className={`gold-frame rounded px-2 py-1 ${prediction === k ? 'bg-gold/30 text-gold-bright' : 'hover:bg-gold/10'}`}
                title={move.desc[lang]}
              >
                {k} · {move.name[lang]}
              </button>
            );
          })}
        </div>
      )}

      {!skillId && (
        <div className="flex gap-2 flex-wrap">
          {def.skills.map((sid) => {
            // Trap! needs at least one free slot inside its own ⏱ window, and Guard needs a
            // living ally other than the caster — otherwise the picker would open with nothing
            // to choose.
            // A card is offered only if the engine would actually accept it. Without this the
            // resource-gated v0.4.0 cards throw out of declareSkill on click, which surfaces as the
            // panel simply doing nothing.
            const hasLivingAlly = battle.fighters.some((f) => f.alive && f.playerId !== decision.playerId);
            const hasDownedAlly = battle.fighters.some((f) => !f.alive && f.playerId !== decision.playerId);
            const disabled =
              (SKILLS[sid].kind === 'trap' && decision.options.trapSlots.length === 0) ||
              (SKILLS[sid].kind === 'guard' && !hasLivingAlly) ||
              (SKILLS[sid].kind === 'buffHaste' && !hasLivingAlly) ||
              (SKILLS[sid].kind === 'raise' && !hasDownedAlly) ||
              (sid === 'Rewind' && fighter.sand < SAND_PER_REWIND) ||
              (sid === 'Assassinate' && fighter.shadow < SHADOW_PER_ASSASSINATE) ||
              (sid === 'DeathCoil' && fighter.souls < SOULS_PER_DEATH_COIL);
            const stats = skillStats(sid, isLv2(sid));
            // Same landing slot the boss's own pending-move readout and the party stat bar already
            // show for things already declared — surfacing it here too lets a player line their
            // pick up against what's already on the board before committing to it, instead of only
            // finding out where they landed after the fact.
            const landedSlot = battle.marker - effectiveDeclareTime(state, fighter, stats.time);
            // <=0, not <0: slot 0 itself is never playable (the battle ends the instant the marker
            // reaches it, before anything there resolves).
            const tooSlow = landedSlot <= 0;
            return (
              <button
                key={sid}
                disabled={disabled}
                onClick={() => {
                  // Routing lives in declareRouting.ts and is exhaustive over SkillKind, so a new
                  // kind cannot silently fall through to a picker that was never written — which is
                  // precisely how Haste/Smoke Bomb/Rewind/Raise Dead shipped as dead buttons.
                  const route = declareRoute(sid, SKILLS[sid].kind);
                  if (route.kind === 'submit') submit({ kind: 'DECLARE_ACTION', skillId: sid });
                  else setSkillId(sid);
                }}
                className="skill-card gold-frame rounded-lg px-3 py-2 hover:bg-gold/10 disabled:opacity-30 text-left"
              >
                <div className="text-sm">
                  {SKILLS[sid].immediate && <span title={t('decision.immediateBadge')}>⚡ </span>}
                  {SKILLS[sid].name[lang]} {isLv2(sid) && <span className="text-gold-bright">{t('decision.lv2')}</span>}
                </div>
                <div className={`text-[10px] ${tooSlow ? 'text-boss' : 'text-gold-dim'}`}>
                  {SKILLS[sid].immediate
                    ? `⏱${stats.time} → ${t('game.landsImmediately', { n: landSlotDisplay(landedSlot) })}`
                    : `⏱${stats.time} → ${t('game.willLandAt', { n: landSlotDisplay(landedSlot) })}`}
                  {tooSlow && ` (${t('decision.tooSlow')})`}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {skillId && skillKind === 'attackMana' && (
        <ManaPicker
          max={decision.options.maxManaSpend}
          onPick={(m) => submit({ kind: 'DECLARE_ACTION', skillId, manaSpent: m })}
          onCancel={() => setSkillId(null)}
        />
      )}

      {skillId && skillKind === 'guard' && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gold-dim">{t('decision.guardTarget')}</span>
          {battle.fighters
            .filter((f) => f.alive && f.playerId !== decision.playerId)
            .map((f) => {
              const p = state.players.find((pp) => pp.id === f.playerId)!;
              return (
                <button
                  key={f.playerId}
                  onClick={() => submit({ kind: 'DECLARE_ACTION', skillId, targetPlayerId: f.playerId })}
                  className="gold-frame rounded px-2 py-1 text-xs hover:bg-gold/10"
                >
                  {p.name} ({f.hp}/{f.maxHp})
                </button>
              );
            })}
          <button onClick={() => setSkillId(null)} className="text-xs text-gold-dim underline">
            {t('common.close')}
          </button>
        </div>
      )}

      {skillId && skillKind === 'heal' && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gold-dim">{t('decision.healTarget')}</span>
          {battle.fighters
            .filter((f) => f.alive)
            .map((f) => {
              const p = state.players.find((pp) => pp.id === f.playerId)!;
              return (
                <button
                  key={f.playerId}
                  onClick={() => submit({ kind: 'DECLARE_ACTION', skillId, targetPlayerId: f.playerId })}
                  className="gold-frame rounded px-2 py-1 text-xs hover:bg-gold/10"
                >
                  {p.name} ({f.hp}/{f.maxHp})
                </button>
              );
            })}
          <button onClick={() => setSkillId(null)} className="text-xs text-gold-dim underline">
            {t('common.close')}
          </button>
        </div>
      )}

      {skillId && skillKind === 'buffHaste' && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gold-dim">{t('decision.hasteTarget')}</span>
          {battle.fighters
            .filter((f) => f.alive && f.playerId !== decision.playerId)
            .map((f) => {
              const p = state.players.find((pp) => pp.id === f.playerId)!;
              // Same clamp the engine applies, so the preview can never promise a move that will
              // not happen. An ally already sitting on the marker is being visited this very tick,
              // so there is no earlier slot to pull them to — offering it would be a dead click.
              const to = Math.min(battle.marker - 1, f.slot + (skillStats(skillId, isLv2(skillId)).primary ?? 0));
              const noGain = to <= f.slot;
              return (
                <button
                  key={f.playerId}
                  disabled={noGain}
                  title={noGain ? t('decision.hasteNoGain') : undefined}
                  onClick={() => submit({ kind: 'DECLARE_ACTION', skillId, targetPlayerId: f.playerId })}
                  className="gold-frame rounded px-2 py-1 text-xs hover:bg-gold/10 disabled:opacity-30"
                >
                  {p.name} ({noGain ? `${f.slot} —` : `${f.slot} → ${to}`})
                </button>
              );
            })}
          <button onClick={() => setSkillId(null)} className="text-xs text-gold-dim underline">
            {t('common.close')}
          </button>
        </div>
      )}

      {skillId && skillKind === 'raise' && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gold-dim">{t('decision.raiseTarget')}</span>
          {/* Downed allies only — the engine rejects a living target outright. */}
          {battle.fighters
            .filter((f) => !f.alive && f.playerId !== decision.playerId)
            .map((f) => {
              const p = state.players.find((pp) => pp.id === f.playerId)!;
              return (
                <button
                  key={f.playerId}
                  onClick={() => submit({ kind: 'DECLARE_ACTION', skillId, targetPlayerId: f.playerId })}
                  className="gold-frame rounded px-2 py-1 text-xs hover:bg-gold/10"
                >
                  {p.name} 💀
                </button>
              );
            })}
          <button onClick={() => setSkillId(null)} className="text-xs text-gold-dim underline">
            {t('common.close')}
          </button>
        </div>
      )}

      {skillId === 'DeathCoil' && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gold-dim">{t('decision.deathCoilCost')}</span>
          <button
            onClick={() => submit({ kind: 'DECLARE_ACTION', skillId, payHp: false })}
            className="gold-frame rounded px-2 py-1 text-xs hover:bg-gold/10"
          >
            {skillStats('DeathCoil', isLv2('DeathCoil')).primary}
          </button>
          <button
            disabled={fighter.hp <= DEATH_COIL_HP_COST}
            onClick={() => submit({ kind: 'DECLARE_ACTION', skillId, payHp: true })}
            className="gold-frame rounded px-2 py-1 text-xs hover:bg-gold/10 disabled:opacity-30"
          >
            {skillStats('DeathCoil', isLv2('DeathCoil')).secondary} (−{DEATH_COIL_HP_COST} HP)
          </button>
          <button onClick={() => setSkillId(null)} className="text-xs text-gold-dim underline">
            {t('common.close')}
          </button>
        </div>
      )}

      {skillId && skillKind === 'trap' && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gold-dim">{t('decision.trapSlot')}</span>
          {/* Must be options.trapSlots, never emptySlotsBelowMarker: a trap is only legal inside
              Trap!'s own ⏱ window, and the engine rejects anything else outright. */}
          {decision.options.trapSlots.map((slot) => (
            <button key={slot} onClick={() => submit({ kind: 'DECLARE_ACTION', skillId, trapSlot: slot })} className="gold-frame rounded px-2 py-1 text-xs hover:bg-gold/10">
              {slot}
            </button>
          ))}
          <button onClick={() => setSkillId(null)} className="text-xs text-gold-dim underline">
            {t('common.close')}
          </button>
        </div>
      )}
    </div>
  );
}

function ManaPicker({ max, onPick, onCancel }: { max: number; onPick: (m: number) => void; onCancel: () => void }) {
  const t = useT();
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <span className="text-xs text-gold-dim">{t('decision.mana')}</span>
      {Array.from({ length: max + 1 }, (_, m) => (
        <button key={m} onClick={() => onPick(m)} className="gold-frame rounded px-3 py-1 text-sm hover:bg-gold/10">
          {m}
        </button>
      ))}
      <button onClick={onCancel} className="text-xs text-gold-dim underline">
        {t('common.close')}
      </button>
    </div>
  );
}
