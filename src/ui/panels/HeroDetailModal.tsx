import type { BattleState, GameState } from '@engine/index';
import { CHARACTERS, SAND_MAX, SHADOW_MAX, SKILLS, V045_LIORA_MANA_MAX, charPassive, charScore, charSkills, skillStats } from '@content/characters';
import { hasV045Content } from '@content/rulesets';
import { skillEffectText } from '@content/skillText';
import { heroStatuses } from '@content/statuses';
import { landSlotDisplay } from '@content/eventText';
import { charImageUrl } from '@ui/common/assets';
import { Modal } from '@ui/common/Modal';
import { StatusList } from '@ui/common/StatusBadges';
import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';

export function HeroDetailModal({
  state,
  battle,
  playerId,
  onClose,
}: {
  state: GameState;
  battle: BattleState;
  playerId: number;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const p = state.players.find((x) => x.id === playerId)!;
  const f = battle.fighters.find((x) => x.playerId === playerId)!;
  const def = CHARACTERS[p.charId];
  // Everything the modal lists is ruleset-dependent under v0.4.5 — the kit, the trait and the
  // three conditions all differ — so all three read through the accessors rather than off def.
  const kit = charSkills(p.charId, state.ruleset);
  const passive = charPassive(p.charId, state.ruleset);
  const conditions = charScore(p.charId, state.ruleset);
  const progress = state.progress[playerId];
  const hpPct = Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100));
  const pending = f.pending ? SKILLS[f.pending.skillId] : null;

  return (
    <Modal
      title={
        <span>
          {p.name} <span className="text-gold-dim text-xs">· {p.charId} ({def.job[lang]})</span>
        </span>
      }
      onClose={onClose}
    >
      <div className="flex gap-3">
        <img src={charImageUrl(p.charId)} alt={p.charId} className="w-24 h-32 object-cover rounded gold-frame flex-shrink-0" draggable={false} />
        <div className="min-w-0 flex-1">
          <div className="mt-1 h-3 bg-black/40 rounded overflow-hidden">
            <div className="h-full bg-front" style={{ width: `${hpPct}%` }} />
          </div>
          <div className="text-xs text-gold-dim mt-1">
            {t('game.hp')} {f.hp}/{f.maxHp}
            {p.charId === 'Liora' && <span className="ml-2">💧 {t('game.mana')} {f.mana}/{V045_LIORA_MANA_MAX}</span>}
            {/* v0.4.5's two new economies. Shown only when they exist: both fields read 0 in the
                stable ruleset, where a permanent "Focus 0" would just be noise. Luna's has no
                denominator because her pool is genuinely uncapped. */}
            {p.charId === 'Kit' && hasV045Content(state.ruleset) && <span className="ml-2">🎯 {t('game.focus')} {f.focus}</span>}
            {p.charId === 'Luna' && hasV045Content(state.ruleset) && <span className="ml-2">💧 {t('game.mana')} {f.mana}</span>}
            {p.charId === 'Chrono' && <span className="ml-2">⏳ {t('game.sand')} {f.sand}/{SAND_MAX}</span>}
            {p.charId === 'Kage' && <span className="ml-2">🌑 {t('game.shadow')} {f.shadow}/{SHADOW_MAX}</span>}
            {p.charId === 'Morvane' && <span className="ml-2">💀 {t('game.souls')} {f.souls}</span>}
          </div>
          <div className="text-xs text-gold-dim mt-1">{t('game.marker', { n: f.slot })}</div>
          {pending && (
            <div className="text-xs mt-1">
              {f.pending!.resolved ? (
                <span className="text-gold-dim">{t('game.usedImmediately', { n: landSlotDisplay(f.pending!.landedAtSlot) })} — </span>
              ) : (
                <span className="text-gold-dim">{t('game.willLandAt', { n: landSlotDisplay(f.pending!.landedAtSlot) })}: </span>
              )}
              <span className="text-gold-bright">
                {pending.immediate && '⚡ '}
                {pending.name[lang]}
              </span>
            </div>
          )}
          <div className="text-xs text-gold-bright mt-1">
            {t('game.score')}: {state.scoreLog.filter((e) => e.playerId === playerId).reduce((s, e) => s + e.points, 0)}
          </div>
        </div>
      </div>

      <Section title={t('detail.statuses')}>
        <StatusList statuses={heroStatuses(battle, f)} />
      </Section>

      <Section title={t('detail.skills')}>
        <div className="flex flex-col gap-2">
          {kit.map((sid) => {
            const isLv2 = !!progress?.isLv2[sid];
            const st = skillStats(sid, isLv2, state.ruleset);
            const exp = progress?.expOnCard[sid] ?? 0;
            const isPending = f.pending?.skillId === sid;
            return (
              <div key={sid} className={`rounded p-2 border ${isPending ? 'border-gold bg-gold/10' : 'border-gold-dim/25'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs gold-text">
                    {SKILLS[sid].immediate && <span title={t('decision.immediateBadge')}>⚡ </span>}
                    {SKILLS[sid].name[lang]}
                    {isLv2 && <span className="ml-1 text-gold-bright">{t('decision.lv2')}</span>}
                  </span>
                  <span className="text-[10px] text-gold-dim flex-shrink-0">⏱{st.time}</span>
                </div>
                <div className="text-[11px] text-gold-dim mt-0.5 leading-snug">{skillEffectText(sid, isLv2, lang, state.ruleset)}</div>
                <div className="text-[10px] text-gold-dim/70 mt-1">{isLv2 ? t('game.expPlacement.flipped') : `EXP ${exp}/3`}</div>
              </div>
            );
          })}
        </div>
      </Section>

      {passive && (
        <Section title={t('detail.passive')}>
          <div className="rounded p-2 border border-gold-dim/25">
            <div className="text-xs gold-text">{passive.name[lang]}</div>
            <div className="text-[11px] text-gold-dim mt-0.5 leading-snug">{passive.desc[lang]}</div>
          </div>
        </Section>
      )}

      <Section title={t('detail.scoreConditions')}>
        <div className="flex flex-col gap-1.5">
          {conditions.map((c) => {
            const claimed = state.scoreLog.filter((e) => e.playerId === playerId && e.conditionId === c.id).length;
            return (
              <div key={c.id} className="flex gap-2 items-start">
                <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${claimed > 0 ? 'bg-gold/30 text-gold-bright' : 'bg-black/30 text-gold-dim'}`}>
                  {c.points}p{c.perOccurrence ? '×' : ''}
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] text-gold-dim leading-snug">{c.desc[lang]}</div>
                  {claimed > 0 && <div className="text-[10px] text-gold-bright">{t('detail.claimed', { n: claimed })}</div>}
                </div>
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
