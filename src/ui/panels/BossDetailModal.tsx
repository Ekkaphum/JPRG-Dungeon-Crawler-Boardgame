import type { BattleState, PlayerMeta } from '@engine/index';
import { BOSSES, bossAppearance, bossDisplayName, bossMoves } from '@content/bosses';
import { bossStatuses } from '@content/statuses';
import { landSlotDisplay } from '@content/eventText';
import { Modal } from '@ui/common/Modal';
import { StatusList } from '@ui/common/StatusBadges';
import { FractureBounties, FractureTicks } from '@ui/clock/FractureTrack';
import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';
import { BossPortrait } from '@ui/common/BossPortrait';

/** `players` is only ever read for names on the fracture read-out — the rest of the panel is pure
 *  boss data. Passed in rather than pulled off a store so the panel stays a function of its props,
 *  like every other detail modal here. */
export function BossDetailModal({
  battle,
  players,
  onClose,
}: {
  battle: BattleState;
  players: PlayerMeta[];
  onClose: () => void;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const def = BOSSES[battle.bossId];
  const hpPct = Math.max(0, Math.min(100, (battle.bossHp / battle.bossHpMax) * 100));

  return (
    <Modal title={bossDisplayName(battle.bossId, battle.phase)[lang]} onClose={onClose}>
      <div className="flex gap-3">
        <BossPortrait bossId={battle.bossId} appearance={bossAppearance(battle.bossId, battle.phase)} className="w-24 h-32 rounded gold-frame flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gold-dim">{def.sin[lang]}</div>
          <div className="mt-2 h-3 bg-black/40 rounded overflow-hidden relative">
            <div className="h-full bg-boss" style={{ width: `${hpPct}%` }} />
            <FractureTicks battle={battle} />
          </div>
          <div className="text-xs text-gold-dim mt-1">
            {t('game.hp')} {battle.bossHp}/{battle.bossHpMax}
          </div>
          <div className="text-xs text-gold-dim mt-1">
            {t('game.marker', { n: battle.bossSlot })}
          </div>
          {/* No "what is coming" line since v0.3.14 — the party reads the clock, not the boss. */}
          <div className="text-xs mt-1 text-gold-dim">{t('game.bossActsAt', { n: landSlotDisplay(battle.bossSlot) })}</div>
        </div>
      </div>

      {/* Above the statuses on purpose: this is the panel players open to answer 'what do I get',
          and the answer should not be below the fold. Renders nothing outside the fracture ruleset. */}
      {battle.fractures.length > 0 && (
        <Section title={t('fracture.title')}>
          <FractureBounties battle={battle} players={players} />
        </Section>
      )}

      <Section title={t('detail.statuses')}>
        <StatusList statuses={bossStatuses(battle)} />
      </Section>

      <Section title={t('detail.moves')}>
        <div className="flex flex-col gap-2">
          {bossMoves(battle.bossId, battle.phase).map((m) => {
            return (
              <div key={m.key} className="rounded p-2 border border-gold-dim/25">
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
