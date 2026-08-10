import type { BattleState } from '@engine/index';
import { BOSSES } from '@content/bosses3';
import { bossStatuses } from '@content/statuses';
import { landSlotDisplay } from '@content/eventText';
import { bossImageUrl } from '@ui/common/assets';
import { Modal } from '@ui/common/Modal';
import { StatusList } from '@ui/common/StatusBadges';
import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';

export function BossDetailModal({ battle, onClose }: { battle: BattleState; onClose: () => void }) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const def = BOSSES[battle.bossId];
  const pending = battle.bossPending;
  const pendingMove = pending ? def.moves.find((m) => m.key === pending.moveKey) : null;
  const hpPct = Math.max(0, Math.min(100, (battle.bossHp / battle.bossHpMax) * 100));

  return (
    <Modal title={def.name[lang]} onClose={onClose}>
      <div className="flex gap-3">
        <img src={bossImageUrl(battle.bossId)} alt={battle.bossId} className="w-24 h-32 object-cover rounded gold-frame flex-shrink-0" draggable={false} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gold-dim">{def.sin[lang]}</div>
          <div className="mt-2 h-3 bg-black/40 rounded overflow-hidden">
            <div className="h-full bg-boss" style={{ width: `${hpPct}%` }} />
          </div>
          <div className="text-xs text-gold-dim mt-1">
            {t('game.hp')} {battle.bossHp}/{battle.bossHpMax}
          </div>
          <div className="text-xs text-gold-dim mt-1">
            {t('game.marker', { n: battle.bossSlot })}
          </div>
          {pendingMove && (
            <div className="text-xs mt-1">
              <span className="text-gold-dim">{t('game.willLandAt', { n: landSlotDisplay(pending!.landedAtSlot) })}: </span>
              <span className="text-gold-bright">{pendingMove.name[lang]}</span> <span className="text-gold-dim">(⏱{pendingMove.time})</span>
            </div>
          )}
        </div>
      </div>

      <Section title={t('detail.statuses')}>
        <StatusList statuses={bossStatuses(battle)} />
      </Section>

      <Section title={t('detail.moves')}>
        <div className="flex flex-col gap-2">
          {def.moves.map((m) => {
            const isPending = pendingMove?.key === m.key;
            return (
              <div key={m.key} className={`rounded p-2 border ${isPending ? 'border-gold bg-gold/10' : 'border-gold-dim/25'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs gold-text">
                    🎲 {m.diceRange[0]}
                    {m.diceRange[1] !== m.diceRange[0] ? `–${m.diceRange[1]}` : ''} · {m.name[lang]}
                  </span>
                  <span className="text-[10px] text-gold-dim flex-shrink-0">⏱{m.time}</span>
                </div>
                <div className="text-[11px] text-gold-dim mt-0.5 leading-snug">{m.desc[lang]}</div>
              </div>
            );
          })}
        </div>
      </Section>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="text-xs font-display gold-text border-b border-gold-dim/30 pb-1 mb-2">{title}</div>
      {children}
    </div>
  );
}
