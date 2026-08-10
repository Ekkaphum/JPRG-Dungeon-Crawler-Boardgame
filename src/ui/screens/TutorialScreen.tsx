import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';
import { CHAR_IDS, CHARACTERS, SKILLS } from '@content/characters';
import { BOSS_IDS, BOSSES } from '@content/bosses3';
import { charImageUrl, bossImageUrl } from '@ui/common/assets';

export function TutorialScreen() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const setScreen = useAppStore((s) => s.setScreen);

  return (
    <div className="min-h-screen p-6 flex flex-col items-center gap-4">
      <h2 className="text-2xl font-display gold-text">{t('tutorial.title')}</h2>

      <div className="flex flex-col gap-3 w-full max-w-lg">
        <div className="gold-frame rounded-lg p-3">
          <div className="gold-text text-sm mb-1">{t('tutorial.core.title')}</div>
          <div className="text-xs text-gold-dim leading-relaxed">{t('tutorial.core.body')}</div>
        </div>
        <div className="gold-frame rounded-lg p-3">
          <div className="gold-text text-sm mb-1">{t('tutorial.death.title')}</div>
          <div className="text-xs text-gold-dim leading-relaxed">{t('tutorial.death.body')}</div>
        </div>
        <div className="gold-frame rounded-lg p-3">
          <div className="gold-text text-sm mb-1">{t('tutorial.score.title')}</div>
          <div className="text-xs text-gold-dim leading-relaxed">{t('tutorial.score.body')}</div>
        </div>
      </div>

      <div className="flex flex-col gap-6 w-full max-w-5xl mt-4">
        <section>
          <h3 className="gold-text font-display text-lg mb-3">{t('tutorial.characters')}</h3>
          <div className="gold-frame rounded-lg overflow-x-auto">
            <table className="w-full text-[11px] border-collapse min-w-[720px]">
              <thead>
                <tr className="gold-text text-left border-b border-gold-dim/40">
                  <th className="px-2 py-1.5">{t('tutorial.col.char')}</th>
                  <th className="px-2 py-1.5">{t('tutorial.col.hp')}</th>
                  <th className="px-2 py-1.5">{t('tutorial.col.startSlot')}</th>
                  <th className="px-2 py-1.5">{t('tutorial.col.skills')}</th>
                  <th className="px-2 py-1.5">{t('tutorial.col.score')}</th>
                </tr>
              </thead>
              <tbody>
                {CHAR_IDS.map((charId, i) => {
                  const def = CHARACTERS[charId];
                  return (
                    <tr key={charId} className={i % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                      <td className="px-2 py-1.5 font-display gold-text">
                        <img src={charImageUrl(charId)} alt={charId} className="w-8 h-8 inline-block rounded mr-1 object-cover align-middle" />
                        {charId} <span className="text-gold-dim text-[10px]">({def.job[lang]})</span>
                      </td>
                      <td className="px-2 py-1.5 text-gold-dim">{def.hp}</td>
                      <td className="px-2 py-1.5 text-gold-dim">{def.startSlot}</td>
                      <td className="px-2 py-1.5 text-gold-dim leading-relaxed">
                        {def.skills.map((sid) => `${SKILLS[sid].name[lang]} (⏱${SKILLS[sid].lv1.time})`).join(' · ')}
                      </td>
                      <td className="px-2 py-1.5 text-gold-dim leading-relaxed">
                        {def.score.map((c) => `${c.desc[lang]} (${c.points}p)`).join(' · ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="gold-text font-display text-lg mb-3">{t('tutorial.bosses')}</h3>
          <div className="flex flex-wrap justify-center gap-4">
            {BOSS_IDS.map((bossId) => {
              const def = BOSSES[bossId];
              return (
                <div key={bossId} className="w-[220px] rounded-md overflow-hidden gold-frame flex flex-col">
                  <div className="relative w-full h-[180px]">
                    <img src={bossImageUrl(bossId)} alt={bossId} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                    <div className="absolute inset-x-0 bottom-0 bg-black/75 px-2 py-1">
                      <div className="text-[11px] font-display gold-text truncate">{def.name[lang]}</div>
                      <div className="text-[10px] text-red-300">{def.sin[lang]}</div>
                    </div>
                  </div>
                  <div className="px-2 py-1.5 text-[10px] leading-tight" style={{ background: '#12161f' }}>
                    <div className="text-gold-dim">
                      HP {def.hp} {def.armor > 0 && `· ${t('game.armor')} ${def.armor}`}
                    </div>
                    {def.moves.map((m) => (
                      <div key={m.key} className="text-gold-dim mt-0.5">
                        {m.diceRange[0]}
                        {m.diceRange[1] !== m.diceRange[0] ? `-${m.diceRange[1]}` : ''}: <span className="text-gold-bright">{m.name[lang]}</span> (⏱{m.time}) — {m.desc[lang]}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <button onClick={() => setScreen('menu')} className="gold-frame rounded-lg px-8 py-3 text-lg hover:bg-gold/10">
        {t('tutorial.close')}
      </button>
    </div>
  );
}
