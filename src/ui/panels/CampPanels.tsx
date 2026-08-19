// Camp UI — the three sub-phases the party plays between boss battles (engine: engine/clock/camp.ts).
//
// Each panel answers exactly one PendingDecision and submits one Choice, the same contract every
// other decision panel follows, so nothing here needs to know the camp's ordering: the generator
// decides who is asked what, and these just render whatever arrives.

import { useState } from 'react';
import { ITEMS, type ItemId } from '@content/items';
import { SKILLS, type SkillId } from '@content/characters';
import { GEMS_PER_UPGRADE, GEMS_PER_VP } from '@engine/clock/camp';
import type { GameState, PendingDecision } from '@engine/index';
import { useT } from '@content/i18n/useT';
import { useAppStore } from '@session/store';
import type { GameSession } from '@session/GameSession';
import { charImageUrl, itemImageUrl } from '@ui/common/assets';

function ItemCard({ id, affordable, onBuy, dimmed }: { id: ItemId; affordable?: boolean; onBuy?: () => void; dimmed?: boolean }) {
  const lang = useAppStore((s) => s.settings.lang);
  const t = useT();
  const def = ITEMS[id];
  return (
    <button
      disabled={!onBuy || !affordable}
      onClick={onBuy}
      className={`item-card item-card--${def.cost} gold-frame rounded-lg text-left ${dimmed ? 'opacity-45' : ''} ${
        onBuy && affordable ? 'hover:bg-gold/10' : 'disabled:opacity-40'
      }`}
    >
      <div className="item-card__art-wrap">
        <img src={itemImageUrl(id)} alt="" className="item-card__art" draggable={false} />
        <span className="item-card__cost" aria-label={t('camp.cost', { n: def.cost })}>◆ {def.cost}</span>
        {!def.consumable && <span className="item-card__permanent">∞</span>}
      </div>
      <div className="item-card__body">
        <div className="flex items-start justify-between gap-1">
          <span className="item-card__name">{def.name[lang]}</span>
        </div>
        <div className="item-card__text">{def.text[lang]}</div>
        {!def.consumable && <div className="item-card__tag">◆ {lang === 'th' ? 'ถาวร' : 'PERMANENT'}</div>}
      </div>
    </button>
  );
}

function CampPlayerHeader({ state, playerId, title, gems }: { state: GameState; playerId: number; title: string; gems: number }) {
  const t = useT();
  const player = state.players.find((p) => p.id === playerId)!;
  return (
    <div className="camp-player-header">
      <img src={charImageUrl(player.charId)} alt="" className="camp-player-portrait" draggable={false} />
      <div className="min-w-0 flex-1">
        <div className="font-display gold-text truncate">{title}</div>
        <div className="camp-player-job">{player.charId}</div>
      </div>
      <div className="camp-gem-purse"><span>◆</span>{t('camp.gems', { n: gems })}</div>
    </div>
  );
}

export function CampBuyPanel({
  state,
  decision,
  session,
}: {
  state: GameState;
  decision: Extract<PendingDecision, { kind: 'CAMP_BUY' }>;
  session: GameSession;
}) {
  const t = useT();
  const player = state.players.find((p) => p.id === decision.playerId)!;
  const submit = (itemId: ItemId | null) => session.submitHumanChoice(decision.playerId, { kind: 'CAMP_BUY', itemId });

  return (
    <div className="decision-board gold-frame rounded-lg p-3">
      <CampPlayerHeader state={state} playerId={decision.playerId} title={t('camp.buyTitle', { name: player.name })} gems={decision.gems} />

      <div className="text-[11px] text-gold-dim mb-1">{t('camp.market')}</div>
      <div className="item-card-grid mb-3">
        {decision.market.map((id, i) => (
          <ItemCard key={`${id}-${i}`} id={id} affordable={ITEMS[id].cost <= decision.gems} onBuy={() => submit(id)} />
        ))}
      </div>

      {decision.futureCard && (
        <>
          <div className="text-[11px] text-gold-dim mb-1">{t('camp.future')}</div>
          <div className="item-card-grid item-card-grid--future mb-3">
            <ItemCard id={decision.futureCard} dimmed />
          </div>
        </>
      )}

      <button onClick={() => submit(null)} className="gold-frame rounded-lg px-3 py-2 text-xs text-gold-dim hover:bg-gold/10">
        {t('camp.pass')}
      </button>
    </div>
  );
}

export function CampUpgradePanel({
  state,
  decision,
  session,
}: {
  state: GameState;
  decision: Extract<PendingDecision, { kind: 'CAMP_UPGRADE' }>;
  session: GameSession;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const player = state.players.find((p) => p.id === decision.playerId)!;
  const [picked, setPicked] = useState<SkillId[]>([]);
  const max = Math.floor(decision.gems / GEMS_PER_UPGRADE);

  const toggle = (id: SkillId) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < max ? [...cur, id] : cur));

  return (
    <div className="decision-board gold-frame rounded-lg p-3">
      <CampPlayerHeader state={state} playerId={decision.playerId} title={t('camp.upgradeTitle', { name: player.name })} gems={decision.gems} />
      <div className="text-xs text-gold-dim mb-2">{t('camp.upgradeCost', { n: GEMS_PER_UPGRADE, max })}</div>

      <div className="flex gap-2 flex-wrap mb-2">
        {decision.upgradable.map((id) => {
          const on = picked.includes(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              disabled={!on && picked.length >= max}
              className={`gold-frame rounded-lg px-3 py-2 disabled:opacity-40 ${on ? 'bg-gold/20' : 'hover:bg-gold/10'}`}
            >
              <div className="text-sm">{SKILLS[id].name[lang]}</div>
              <div className="text-[10px] text-gold-dim">{on ? '✓' : `${GEMS_PER_UPGRADE}`}</div>
            </button>
          );
        })}
      </div>

      <div className="text-[11px] text-gold-dim mb-2">
        {t('camp.selected', { n: picked.length, cost: picked.length * GEMS_PER_UPGRADE })}
      </div>
      <button
        onClick={() => session.submitHumanChoice(decision.playerId, { kind: 'CAMP_UPGRADE', skillIds: picked })}
        className="gold-frame rounded-lg px-3 py-2 text-sm hover:bg-gold/10"
      >
        {t('camp.confirm')}
      </button>
    </div>
  );
}

export function CampVpPanel({
  state,
  decision,
  session,
}: {
  state: GameState;
  decision: Extract<PendingDecision, { kind: 'CAMP_VP' }>;
  session: GameSession;
}) {
  const t = useT();
  const player = state.players.find((p) => p.id === decision.playerId)!;
  const vp = Math.floor(decision.gems / GEMS_PER_VP);
  const submit = (gemsSpent: number) => session.submitHumanChoice(decision.playerId, { kind: 'CAMP_VP', gemsSpent });

  return (
    <div className="decision-board gold-frame rounded-lg p-3">
      <CampPlayerHeader state={state} playerId={decision.playerId} title={t('camp.vpTitle', { name: player.name })} gems={decision.gems} />
      <div className="text-xs text-gold-dim mb-3">{t('camp.vpRate', { cost: GEMS_PER_VP })}</div>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => submit(vp * GEMS_PER_VP)}
          className="gold-frame rounded-lg px-3 py-2 text-sm hover:bg-gold/10"
        >
          {t('camp.vpBuy', { n: vp, cost: vp * GEMS_PER_VP })}
        </button>
        <button onClick={() => submit(0)} className="gold-frame rounded-lg px-3 py-2 text-xs text-gold-dim hover:bg-gold/10">
          {t('camp.vpNone')}
        </button>
      </div>
    </div>
  );
}
