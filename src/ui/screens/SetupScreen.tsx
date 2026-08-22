import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';
import { useAppStore as useLangStore } from '@session/store';
import type { Difficulty } from '@content/difficulty';
import { RULESETS, rulesetDef, type RulesetVersion } from '@content/rulesets';

export function SetupScreen() {
  const t = useT();
  // The ruleset entries carry their own th/en text (they are content, not i18n keys), so this screen
  // has to pick the side itself — it was hardcoded to .th and showed Thai to English players.
  const lang = useLangStore((s) => s.settings.lang);
  const {
    players,
    difficulty,
    ruleset,
    setRuleset,
    seedText,
    draftMode,
    draftOrder,
    updatePlayer,
    setDifficulty,
    setSeedText,
    setDraftMode,
    moveDraftSlot,
    startNewGame,
    setScreen,
  } = useAppStore();

  return (
    <div className="min-h-screen p-4 flex flex-col items-center gap-4">
      <h2 className="text-2xl font-display gold-text mt-4">{t('setup.title')}</h2>

      <div className="gold-frame rounded-lg p-4 w-full max-w-lg">
        <div className="text-xs text-gold-dim">{t('setup.playersFixed')}</div>

        <div className="mt-3 flex flex-col gap-2">
          {players.map((p, i) => (
            <div key={i} className="flex items-center gap-2 gold-frame rounded p-2">
              <span className="text-xs text-gold-dim w-6">{i + 1}</span>
              <input
                value={p.name}
                onChange={(e) => updatePlayer(i, { name: e.target.value })}
                placeholder={t('setup.name.placeholder')}
                className="bg-black/30 rounded px-2 py-1 text-sm flex-1 min-w-0"
              />
              <select
                value={p.kind}
                onChange={(e) => updatePlayer(i, { kind: e.target.value as 'human' | 'bot' })}
                className="bg-black/30 rounded px-2 py-1 text-sm"
              >
                <option value="human">{t('setup.human')}</option>
                <option value="bot">{t('setup.bot')}</option>
              </select>
              {p.kind === 'bot' && (
                <select
                  value={p.botLevel}
                  onChange={(e) => updatePlayer(i, { botLevel: e.target.value as 'easy' | 'medium' | 'hard' })}
                  className="bg-black/30 rounded px-2 py-1 text-sm"
                >
                  <option value="easy">{t('setup.level.easy')}</option>
                  <option value="medium">{t('setup.level.medium')}</option>
                  <option value="hard">{t('setup.level.hard')}</option>
                </select>
              )}
            </div>
          ))}
        </div>

        {/* Ruleset first, above difficulty: it decides which characters even exist, so choosing it
            after picking a difficulty would read backwards. */}
        <div className="mt-4">
          <label className="text-sm gold-text">{t('setup.ruleset')}</label>
          <div className="text-[11px] text-gold-dim mt-1">{t('setup.rulesetHint')}</div>
          <div className="flex flex-col gap-2 mt-2">
            {(Object.keys(RULESETS) as RulesetVersion[]).map((v) => {
              const def = rulesetDef(v);
              const selected = ruleset === v;
              return (
                <button
                  key={v}
                  onClick={() => setRuleset(v)}
                  className={`text-left px-3 py-2 rounded border ${
                    selected ? 'bg-gold/25 border-gold/60 text-gold-bright' : 'bg-black/20 border-transparent text-gold-dim'
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <strong className="text-sm">{def.label}</strong>
                    <span className="text-xs">{def.name[lang]}</span>
                    {def.experimental && <span className="version-warn text-[11px]">⚠️</span>}
                  </div>
                  <div className="text-[11px] mt-0.5 opacity-90">{def.desc[lang]}</div>
                  <ul className="text-[11px] mt-1 opacity-80 list-disc list-inside">
                    {def.highlights.map((h) => (
                      <li key={h.th}>{h[lang]}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
          {rulesetDef(ruleset).experimental && (
            <div className="version-warn text-[11px] mt-2">{t('setup.rulesetExperimentalWarning')}</div>
          )}
        </div>

        <div className="mt-4">
          <label className="text-sm gold-text">{t('setup.difficulty')}</label>
          <div className="flex gap-2 mt-2">
            {(['relaxed', 'standard', 'challenge'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-2 rounded text-sm ${difficulty === d ? 'bg-gold/30 text-gold-bright' : 'bg-black/20 text-gold-dim'}`}
              >
                {t(`setup.difficulty.${d}` as 'setup.difficulty.relaxed')}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="text-sm gold-text">{t('setup.draftOrder')}</label>
          <div className="flex gap-2 mt-2">
            {(['random', 'manual'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setDraftMode(m)}
                className={`flex-1 py-2 rounded text-sm ${draftMode === m ? 'bg-gold/30 text-gold-bright' : 'bg-black/20 text-gold-dim'}`}
              >
                {t(m === 'random' ? 'setup.draftOrder.random' : 'setup.draftOrder.manual')}
              </button>
            ))}
          </div>
          {draftMode === 'manual' ? (
            <div className="mt-2 flex flex-col gap-1">
              {draftOrder.map((seat, i) => (
                <div key={seat} className="flex items-center gap-2 gold-frame rounded px-2 py-1">
                  <span className="text-xs text-gold-bright w-5 flex-shrink-0">{i + 1}.</span>
                  <span className="text-sm flex-1 truncate">{players[seat]?.name || `Player ${seat + 1}`}</span>
                  <button
                    onClick={() => moveDraftSlot(i, -1)}
                    disabled={i === 0}
                    className="px-2 text-gold-dim hover:text-gold-bright disabled:opacity-25"
                    aria-label="move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveDraftSlot(i, 1)}
                    disabled={i === draftOrder.length - 1}
                    className="px-2 text-gold-dim hover:text-gold-bright disabled:opacity-25"
                    aria-label="move down"
                  >
                    ↓
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-xs text-gold-dim">{t('setup.draftOrder.randomHint')}</div>
          )}
        </div>

        <div className="mt-4">
          <label className="text-sm gold-text">{t('setup.seed')}</label>
          <input
            value={seedText}
            onChange={(e) => setSeedText(e.target.value)}
            placeholder={t('setup.seedRandom')}
            className="bg-black/30 rounded px-2 py-1 text-sm w-full mt-1"
          />
        </div>

        <div className="mt-3 text-xs text-gold-dim">{t('setup.rule.hint')}</div>

        <button onClick={startNewGame} className="w-full mt-4 gold-frame rounded-lg py-3 text-lg font-display hover:bg-gold/10">
          {t('setup.start')}
        </button>
        <button onClick={() => setScreen('menu')} className="w-full mt-2 text-xs text-gold-dim underline">
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
