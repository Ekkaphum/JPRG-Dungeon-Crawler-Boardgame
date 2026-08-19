import { useState } from 'react';
import { effectiveDeclareTime, type Choice, type GameState, type PendingDecision, type SkillId } from '@engine/index';
import { CHARACTERS, CHAR_IDS, SKILLS, skillStats } from '@content/characters';
import { landSlotDisplay } from '@content/eventText';
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
  const player = state.players.find((p) => p.id === decision.playerId)!;
  const def = CHARACTERS[decision.options.charId];
  const battle = state.battle!;
  const fighter = battle.fighters.find((f) => f.playerId === decision.playerId)!;
  const isLv2 = (sid: SkillId) => !!state.progress[decision.playerId]?.isLv2[sid];

  const submit = (choice: Choice) => {
    setSkillId(null);
    session.submitHumanChoice(decision.playerId, choice);
  };

  const skillKind = skillId ? SKILLS[skillId].kind : null;

  return (
    <div className="decision-board gold-frame rounded-lg p-3">
      <div className="font-display gold-text mb-2">{t('decision.declareTitle', { name: player.name })}</div>

      {!skillId && (
        <div className="flex gap-2 flex-wrap">
          {def.skills.map((sid) => {
            // Trap! needs at least one free slot inside its own ⏱ window, and Guard needs a
            // living ally other than the caster — otherwise the picker would open with nothing
            // to choose.
            const disabled =
              (SKILLS[sid].kind === 'trap' && decision.options.trapSlots.length === 0) ||
              (SKILLS[sid].kind === 'guard' && !battle.fighters.some((f) => f.alive && f.playerId !== decision.playerId));
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
                  const s = SKILLS[sid];
                  // No extra params needed → submit immediately.
                  if (
                    s.kind === 'attack' ||
                    s.kind === 'attackGated' ||
                    s.kind === 'attackRoll' ||
                    s.kind === 'multiHit' ||
                    s.kind === 'buffCounter' ||
                    s.kind === 'buffParty' ||
                    s.kind === 'buffMana'
                  ) {
                    submit({ kind: 'DECLARE_ACTION', skillId: sid });
                  } else {
                    setSkillId(sid);
                  }
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
