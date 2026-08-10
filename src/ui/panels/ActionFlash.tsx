import type { BossId } from '@engine/index';
import { SKILLS } from '@content/characters';
import { skillBriefText } from '@content/skillText';
import { BOSSES } from '@content/bosses3';
import { useAppStore } from '@session/store';
import type { ActionFlash as Flash, FlashTone } from '@session/playback';

const TONE: Record<FlashTone, string> = {
  attack: 'text-[#ff7a63]',
  heal: 'text-[#5fe39b]',
  buff: 'text-gold-bright',
};

/** Big announcement over the middle of the board the instant something lands: a skill or boss move
 *  with a one-line reminder of what it does, or a die roll with its outcome. Purely decorative —
 *  the parent must be `relative`; pointer events pass straight through. */
export function ActionFlash({ flash, bossId }: { flash: Flash | null; bossId: BossId }) {
  const lang = useAppStore((s) => s.settings.lang);
  if (!flash) return null;

  let title = '';
  let detail = '';

  if (flash.source === 'boss') {
    const move = BOSSES[bossId].moves.find((m) => m.key === flash.moveKey);
    if (!move) return null;
    title = move.name[lang];
    detail = move.desc[lang];
  } else if (flash.source === 'skill') {
    title = SKILLS[flash.skillId].name[lang];
    detail = skillBriefText(flash.skillId, flash.isLv2, lang);
  } else {
    title = `🎲 ${flash.die}`;
    if (flash.moveKey) {
      // A roll that picked the boss's next move rather than passing a check.
      const move = BOSSES[bossId].moves.find((m) => m.key === flash.moveKey);
      detail = move ? (lang === 'th' ? `บอสจะใช้ ${move.name.th}` : `Boss will use ${move.name.en}`) : '';
    } else if (flash.target != null) {
      const need = lang === 'th' ? `ต้อง ${flash.target}+` : `needed ${flash.target}+`;
      const outcome = flash.success ? (lang === 'th' ? 'สำเร็จ' : 'success') : lang === 'th' ? 'พลาด' : 'miss';
      detail = `${need} → ${outcome}`;
    } else {
      detail = flash.success ? (lang === 'th' ? 'สำเร็จอัตโนมัติ' : 'automatic success') : '';
    }
  }

  if (!title) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
      <div key={flash.id} className="action-flash text-center px-6 max-w-[80%]">
        <div
          className={`font-display font-bold tracking-wide text-3xl sm:text-5xl ${TONE[flash.tone]}`}
          style={{ textShadow: '0 0 18px rgba(0,0,0,0.95), 0 3px 6px rgba(0,0,0,0.95)' }}
        >
          {title}
        </div>
        {detail && (
          <div className="mt-1 text-xs sm:text-sm text-[#e8e4d8] leading-snug" style={{ textShadow: '0 0 12px rgba(0,0,0,1), 0 2px 4px rgba(0,0,0,1)' }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
