import { useState, type ReactNode } from 'react';
import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';
import { CHAR_IDS, CHARACTERS, SKILLS, charScore, charSkills, skillStats } from '@content/characters';
import { BOSS_IDS, BOSSES } from '@content/bosses3';
import { CLASS_COLOR } from '@content/charColors';
import { hasCamp } from '@content/rulesets';
import { GEMS_PER_UPGRADE, GEMS_PER_VP, GEMS_TIME_DIVISOR, MARKET_SIZE } from '@engine/clock/camp';
import { charImageUrl, bossImageUrl } from '@ui/common/assets';
import { ClockStrip, DiceLadder, Figure, ScreenMap, StepFlow } from '@ui/tutorial/RuleFigure';

/** The How-to-Play screen is a board-game rulebook rather than a page of paragraphs: it is split
 *  into chapters you page through, and every rule with a position, an order or a duration on the
 *  clock is drawn as a figure instead of described.
 *
 *  One chapter is mounted at a time on purpose. The whole thing as a single scroll is roughly six
 *  screens tall, which is the length at which people stop reading — and the chapter buttons double
 *  as an index for the player who came back mid-game to check one specific rule.
 *
 *  Ruleset-sensitive throughout: the reference tables and the camp chapter both read the ruleset
 *  the *next* game will start under, so a player who picked Experimental in the menu is not taught
 *  the v0.3 kits or told about an EXP system their game will not use. */

type ChapterId = 'goal' | 'clock' | 'turn' | 'screen' | 'combat' | 'death' | 'score' | 'camp' | 'ref';

const CHAPTERS: ChapterId[] = ['goal', 'clock', 'turn', 'screen', 'combat', 'death', 'score', 'camp', 'ref'];

export function TutorialScreen() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const setScreen = useAppStore((s) => s.setScreen);
  // The ruleset the *next* game will start under, not a fixed one: under v0.4.5 three of the four
  // core characters hold a different kit and two of them score for different things, so a tutorial
  // pinned to v0.3 would teach the wrong game to anyone who picked Experimental in the menu.
  const ruleset = useAppStore((s) => s.ruleset);
  const [chapter, setChapter] = useState<ChapterId>('goal');

  const idx = CHAPTERS.indexOf(chapter);
  const go = (next: ChapterId) => {
    setChapter(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="rulebook min-h-screen flex flex-col items-center px-3 pb-8">
      <div className="rulebook__nav w-full max-w-4xl">
        {CHAPTERS.map((id, i) => (
          <button key={id} onClick={() => go(id)} className={id === chapter ? 'is-active' : ''}>
            {i + 1}. {t(`tut.nav.${id}` as 'tut.nav.goal')}
          </button>
        ))}
      </div>

      <div className="w-full max-w-4xl flex flex-col gap-4">
        <header className="text-center">
          <div className="text-[0.62rem] tracking-[0.22em] text-gold-dim uppercase">
            {t('tutorial.title')} · {t('tut.chapterOf', { n: idx + 1 })}
          </div>
          <h2 className="text-2xl font-display gold-text mt-0.5">{t(`tut.${chapter}.h` as 'tut.goal.h')}</h2>
        </header>

        <div className="rulebook__chapter">
          {chapter === 'goal' && <GoalChapter />}
          {chapter === 'clock' && <ClockChapter />}
          {chapter === 'turn' && <TurnChapter />}
          {chapter === 'screen' && <ScreenChapter />}
          {chapter === 'combat' && <CombatChapter />}
          {chapter === 'death' && <DeathChapter />}
          {chapter === 'score' && <ScoreChapter />}
          {chapter === 'camp' && <CampChapter />}
          {chapter === 'ref' && <RefChapter lang={lang} ruleset={ruleset} />}
        </div>

        <div className="flex items-center justify-between gap-2 mt-2">
          <button
            disabled={idx === 0}
            onClick={() => go(CHAPTERS[idx - 1])}
            className="gold-frame rounded-lg px-3 py-2 text-xs disabled:opacity-25 hover:bg-gold/10"
          >
            {idx > 0 ? t('tut.prev', { name: t(`tut.nav.${CHAPTERS[idx - 1]}` as 'tut.nav.goal') }) : ''}
          </button>
          {idx < CHAPTERS.length - 1 ? (
            <button onClick={() => go(CHAPTERS[idx + 1])} className="gold-frame rounded-lg px-3 py-2 text-xs hover:bg-gold/10">
              {t('tut.next', { name: t(`tut.nav.${CHAPTERS[idx + 1]}` as 'tut.nav.goal') })}
            </button>
          ) : (
            <button onClick={() => setScreen('menu')} className="gold-frame rounded-lg px-6 py-2 text-sm gold-text hover:bg-gold/10">
              {t('tutorial.close')}
            </button>
          )}
        </div>

        <button onClick={() => setScreen('menu')} className="text-[0.68rem] text-gold-dim underline self-center">
          {t('tutorial.close')}
        </button>
      </div>
    </div>
  );
}

// ── shared bits ─────────────────────────────────────────────────────────────────────────────────

function Lede({ children }: { children: ReactNode }) {
  return <p className="rulebook__lede">{children}</p>;
}

function Rule({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rule-card">
      <div className="rule-card__title">{title}</div>
      <div className="rule-card__body">{children}</div>
    </div>
  );
}

function Example({ tag, children, warn }: { tag: string; children: ReactNode; warn?: boolean }) {
  return (
    <div className={`rule-example${warn ? ' rule-warn' : ''}`}>
      <span className="rule-example__tag">{tag}</span>
      <div className="text-[0.72rem] leading-[1.75] text-[#c9c2b0]">{children}</div>
    </div>
  );
}

// ── 1. goal ─────────────────────────────────────────────────────────────────────────────────────

function GoalChapter() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  return (
    <>
      <Lede>{t('tut.goal.lede')}</Lede>

      <div className="rule-grid2">
        <Rule title={t('tut.goal.win.title')}>{t('tut.goal.win.body')}</Rule>
        <Rule title={t('tut.goal.lose.title')}>{t('tut.goal.lose.body')}</Rule>
      </div>
      <Rule title={t('tut.goal.tie.title')}>{t('tut.goal.tie.body')}</Rule>

      <Figure label={t('tut.figure', { n: 1 })} caption={t('tut.goal.bosses.body')}>
        <div className="text-[0.74rem] gold-text mb-2">{t('tut.goal.bosses.title')}</div>
        <div className="flex gap-2">
          {BOSS_IDS.map((bossId, i) => {
            const def = BOSSES[bossId];
            return (
              <div key={bossId} className="flex-1 min-w-0 rounded-md overflow-hidden border border-gold-dim/50">
                <div className="relative h-[92px]">
                  <img src={bossImageUrl(bossId)} alt={bossId} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                  <div className="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-0.5">
                    <div className="text-[0.6rem] gold-text truncate">
                      {i + 1}. {bossId}
                    </div>
                    <div className="text-[0.55rem] text-red-300 truncate">{def.sin[lang]}</div>
                  </div>
                </div>
                <div className="px-1.5 py-1 text-[0.58rem] text-gold-dim" style={{ background: '#12161f' }}>
                  HP {def.hp}
                  {def.armor > 0 && ` · ${t('game.armor')} ${def.armor}`}
                </div>
              </div>
            );
          })}
        </div>
      </Figure>

      <Example tag={t('tut.watchOut')} warn>
        {t('tut.goal.tension')}
      </Example>
    </>
  );
}

// ── 2. clock ────────────────────────────────────────────────────────────────────────────────────

const C = CLASS_COLOR;
const BOSS_COLOR = '#c0392b';

function ClockChapter() {
  const t = useT();
  return (
    <>
      <Lede>{t('tut.clock.lede')}</Lede>

      <Figure label={t('tut.figure', { n: 1 })} caption={t('tut.clock.fig1')}>
        <ClockStrip
          marker={24}
          pawns={[
            { label: 'Er', slot: 23, color: C.Eric, stack: 0 },
            { label: 'Ki', slot: 23, color: C.Kit, stack: 1 },
            { label: 'Li', slot: 23, color: C.Liora, stack: 2 },
            { label: 'Lu', slot: 23, color: C.Luna, stack: 3 },
            { label: '☠', slot: 23, color: BOSS_COLOR, stack: 4 },
          ]}
        />
      </Figure>

      <Figure label={t('tut.figure', { n: 2 })} caption={t('tut.clock.fig2')}>
        <ClockStrip
          marker={20}
          pawns={[
            { label: 'Ki', slot: 20, color: C.Kit },
            { label: '☠', slot: 19, color: BOSS_COLOR },
            { label: 'Lu', slot: 18, color: C.Luna },
            { label: 'Er', slot: 17, color: C.Eric },
            { label: 'Li', slot: 14, color: C.Liora },
          ]}
        />
      </Figure>

      <div className="rule-grid2">
        <Rule title={t('tut.clock.r1.title')}>{t('tut.clock.r1.body')}</Rule>
        <Rule title={t('tut.clock.r2.title')}>{t('tut.clock.r2.body')}</Rule>
        <Rule title={t('tut.clock.r3.title')}>{t('tut.clock.r3.body')}</Rule>
        <Rule title={t('tut.clock.r4.title')}>{t('tut.clock.r4.body')}</Rule>
      </div>

      <Example tag={t('tut.clock.time.title')}>{t('tut.clock.time.body')}</Example>
    </>
  );
}

// ── 3. turn ─────────────────────────────────────────────────────────────────────────────────────

function TurnChapter() {
  const t = useT();
  return (
    <>
      <Lede>{t('tut.turn.lede')}</Lede>

      <StepFlow
        steps={[
          { n: '1', title: t('tut.turn.s1.title'), body: t('tut.turn.s1.body') },
          { n: '2', title: t('tut.turn.s2.title'), body: t('tut.turn.s2.body') },
          { n: '3', title: t('tut.turn.s3.title'), body: t('tut.turn.s3.body') },
        ]}
      />

      <Figure label={t('tut.figure', { n: 1 })} caption={t('tut.turn.fig1')}>
        <ClockStrip
          marker={23}
          spans={[{ from: 23, to: 19, text: 'Power Strike ⏱4' }]}
          pawns={[
            { label: 'Er', slot: 23, color: C.Eric, ghost: true },
            { label: 'Er', slot: 19, color: C.Eric },
            { label: '☠', slot: 21, color: BOSS_COLOR },
          ]}
        />
      </Figure>

      <Figure label={t('tut.figure', { n: 2 })} caption={t('tut.turn.fig2')}>
        <ClockStrip
          marker={19}
          pawns={[
            { label: 'Er', slot: 19, color: C.Eric },
            { label: '☠', slot: 16, color: BOSS_COLOR },
          ]}
          flags={[{ slot: 19, text: '▲', color: 'var(--gold-bright)' }]}
        />
      </Figure>

      <Example tag={t('tut.example')}>{t('tut.turn.ex1')}</Example>

      <Rule title={t('tut.turn.instant.title')}>{t('tut.turn.instant.body')}</Rule>
      <Example tag={t('tut.watchOut')} warn>
        <strong>{t('tut.turn.waste.title')}</strong>
        <br />
        {t('tut.turn.waste.body')}
      </Example>
      <Rule title={t('tut.turn.open.title')}>{t('tut.turn.open.body')}</Rule>
    </>
  );
}

// ── 4. screen ───────────────────────────────────────────────────────────────────────────────────

function ScreenChapter() {
  const t = useT();
  return (
    <>
      <Lede>{t('tut.screen.lede')}</Lede>
      <Figure label={t('tut.figure', { n: 1 })} caption={t('tut.screen.tip')}>
        <ScreenMap
          zones={[
            { key: 'top', n: '1', title: t('tut.screen.z1.t'), body: t('tut.screen.z1.b') },
            { key: 'stage', n: '2', title: t('tut.screen.z2.t'), body: t('tut.screen.z2.b') },
            { key: 'clock', n: '3', title: t('tut.screen.z3.t'), body: t('tut.screen.z3.b') },
            { key: 'banner', n: '4', title: t('tut.screen.z4.t'), body: t('tut.screen.z4.b') },
            { key: 'command', n: '5', title: t('tut.screen.z5.t'), body: t('tut.screen.z5.b') },
            { key: 'party', n: '6', title: t('tut.screen.z6.t'), body: t('tut.screen.z6.b') },
            { key: 'log', n: '7', title: t('tut.screen.z7.t'), body: t('tut.screen.z7.b') },
          ]}
        />
      </Figure>
    </>
  );
}

// ── 5. combat ───────────────────────────────────────────────────────────────────────────────────

function CombatChapter() {
  const t = useT();
  return (
    <>
      <Lede>{t('tut.combat.lede')}</Lede>

      <Figure>
        <div className="rule-formula">
          {t('tut.combat.formula')}
          <em>{t('tut.combat.formulaNote')}</em>
        </div>
      </Figure>

      <Rule title={t('tut.combat.weak.title')}>{t('tut.combat.weak.body')}</Rule>

      <Figure label={t('tut.figure', { n: 1 })} caption={t('tut.combat.ex')}>
        <ClockStrip
          marker={16}
          spans={[{ from: 16, to: 12, text: '+4 · 4 ⏱', color: 'var(--gold-bright)' }]}
          pawns={[
            { label: 'Ki', slot: 16, color: C.Kit },
            { label: 'Li', slot: 14, color: C.Liora },
            { label: 'Er', slot: 13, color: C.Eric },
            { label: '☠', slot: 11, color: BOSS_COLOR },
          ]}
        />
      </Figure>

      <Figure label={t('tut.figure', { n: 2 })} caption={t('tut.combat.dice.note')}>
        <div className="text-[0.74rem] gold-text mb-2">{t('tut.combat.dice.title')}</div>
        <DiceLadder targets={['5+', '4+', '3+', '2+', t('tut.combat.dice.auto')]} caption={t('tut.combat.dice.body')} />
      </Figure>

      <Rule title={t('tut.combat.boss.title')}>{t('tut.combat.boss.body')}</Rule>
    </>
  );
}

// ── 6. death ────────────────────────────────────────────────────────────────────────────────────

function DeathChapter() {
  const t = useT();
  return (
    <>
      <Lede>{t('tut.death.lede')}</Lede>

      <Figure label={t('tut.figure', { n: 1 })} caption={t('tut.death.fig')}>
        <ClockStrip
          marker={14}
          spans={[{ from: 14, to: 8, text: '6 ⏱', color: '#c0392b' }]}
          pawns={[
            { label: 'Li', slot: 14, color: C.Liora, ghost: true },
            { label: 'Li', slot: 8, color: C.Liora },
            { label: '☠', slot: 12, color: BOSS_COLOR },
          ]}
          flags={[{ slot: 8, text: '↑', color: '#6ab04c' }]}
        />
      </Figure>

      <div className="rule-grid2">
        <Rule title={t('tut.death.r1.title')}>{t('tut.death.r1.body')}</Rule>
        <Rule title={t('tut.death.r2.title')}>{t('tut.death.r2.body')}</Rule>
        <Rule title={t('tut.death.r3.title')}>{t('tut.death.r3.body')}</Rule>
        <Rule title={t('tut.death.r4.title')}>{t('tut.death.r4.body')}</Rule>
      </div>

      <Example tag={t('tut.watchOut')} warn>
        {t('tut.death.ex')}
      </Example>
    </>
  );
}

// ── 7. score ────────────────────────────────────────────────────────────────────────────────────

function ScoreChapter() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.lang);
  const ruleset = useAppStore((s) => s.ruleset);
  // Read a real character's three conditions next to the abstract shape, so the ①②③ structure is
  // shown rather than asserted. Eric is the least conditional of the four and reads cleanest cold.
  const sample = charScore('Eric', ruleset);
  return (
    <>
      <Lede>{t('tut.score.lede')}</Lede>

      <div className="rule-grid2">
        <Rule title={t('tut.score.s1.title')}>{t('tut.score.s1.body')}</Rule>
        <Rule title={t('tut.score.s2.title')}>{t('tut.score.s2.body')}</Rule>
        <Rule title={t('tut.score.s3.title')}>{t('tut.score.s3.body')}</Rule>
        <Rule title={t('tut.score.time.title')}>{t('tut.score.time.body')}</Rule>
      </div>

      <Figure label={t('tut.figure', { n: 1 })} caption={t('tut.score.fig')}>
        <div className="flex items-center gap-2 mb-2">
          <img src={charImageUrl('Eric')} alt="Eric" className="w-9 h-9 rounded object-cover" />
          <div className="text-[0.74rem] gold-text">Eric — {CHARACTERS.Eric.job[lang]}</div>
        </div>
        <div className="flex flex-col gap-1">
          {sample.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-[0.7rem] leading-relaxed">
              <span className="gold-text flex-shrink-0">{['①', '②', '③'][i]}</span>
              <span className="text-[#9a927e]">{c.desc[lang]}</span>
              <span className="ml-auto flex-shrink-0 gold-text">{c.points}p</span>
            </div>
          ))}
        </div>
      </Figure>

      <Example tag={t('tut.score.open.title')}>{t('tut.score.open.body')}</Example>
    </>
  );
}

// ── 8. camp ─────────────────────────────────────────────────────────────────────────────────────

function CampChapter() {
  const t = useT();
  const ruleset = useAppStore((s) => s.ruleset);
  return (
    <>
      <Lede>{t('tut.camp.lede')}</Lede>

      {/* Shown to v0.3 players too, but with the EXP note promoted to the top: the chapter is still
          worth reading before switching rulesets, and burying "this does not apply to your game"
          at the bottom would be the wrong order to learn it in. */}
      {!hasCamp(ruleset) && (
        <Example tag={t('tut.watchOut')} warn>
          {t('tut.camp.rule3')}
        </Example>
      )}

      <StepFlow
        steps={[
          { n: 'Ⅰ', title: t('tut.camp.p1.title'), body: t('tut.camp.p1.body') },
          { n: 'Ⅱ', title: t('tut.camp.p2.title'), body: t('tut.camp.p2.body') },
          { n: 'Ⅲ', title: t('tut.camp.p3.title'), body: t('tut.camp.p3.body') },
        ]}
      />

      <Figure label={t('tut.figure', { n: 1 })}>
        <div className="flex flex-wrap gap-2 text-[0.68rem] text-[#9a927e]">
          <span className="gold-frame rounded px-2 py-1">
            {t('camp.market')}: <b className="gold-text">{MARKET_SIZE}</b>
          </span>
          <span className="gold-frame rounded px-2 py-1">
            {t('camp.phaseUpgrade')}: <b className="gold-text">{GEMS_PER_UPGRADE}</b> 💎
          </span>
          <span className="gold-frame rounded px-2 py-1">
            {t('camp.phaseVp')}: <b className="gold-text">{GEMS_PER_VP}</b> 💎 = 1p
          </span>
          <span className="gold-frame rounded px-2 py-1">
            ⏱ ÷ <b className="gold-text">{GEMS_TIME_DIVISOR}</b> 💎
          </span>
        </div>
      </Figure>

      <div className="rule-grid2">
        <Rule title="💎">{t('tut.camp.rule1')}</Rule>
        <Rule title="⏱ 0">{t('tut.camp.rule2')}</Rule>
      </div>

      <Example tag={t('tut.example')}>{t('tut.camp.ex')}</Example>
      {hasCamp(ruleset) && <p className="text-[0.68rem] text-gold-dim">{t('tut.camp.rule3')}</p>}
    </>
  );
}

// ── 9. reference ────────────────────────────────────────────────────────────────────────────────

function RefChapter({ lang, ruleset }: { lang: 'th' | 'en'; ruleset: ReturnType<typeof useAppStore.getState>['ruleset'] }) {
  const t = useT();
  return (
    <>
      <Lede>{t('tut.ref.lede')}</Lede>

      <section>
        <div className="rulebook__h">
          <b>A</b>
          <span className="font-display">{t('tutorial.characters')}</span>
        </div>
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
                      {charSkills(def.id, ruleset)
                        .map((sid) => `${SKILLS[sid].immediate ? '⚡ ' : ''}${SKILLS[sid].name[lang]} (⏱${skillStats(sid, false, ruleset).time})`)
                        .join(' · ')}
                    </td>
                    <td className="px-2 py-1.5 text-gold-dim leading-relaxed">
                      {charScore(def.id, ruleset)
                        .map((c) => `${c.desc[lang]} (${c.points}p)`)
                        .join(' · ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="rulebook__h">
          <b>B</b>
          <span className="font-display">{t('tutorial.bosses')}</span>
        </div>
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
                      {m.diceRange[1] !== m.diceRange[0] ? `-${m.diceRange[1]}` : ''}: <span className="text-gold-bright">{m.name[lang]}</span> (⏱{m.time}) —{' '}
                      {m.desc[lang]}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
