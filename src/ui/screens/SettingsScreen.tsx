import { useAppStore } from '@session/store';
import { useT } from '@content/i18n/useT';
import { ANIM_DELAY_OPTIONS } from '@session/persistence';

export function SettingsScreen() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setScreen = useAppStore((s) => s.setScreen);

  return (
    <div className="min-h-screen p-6 flex flex-col items-center gap-4">
      <h2 className="text-2xl font-display gold-text">{t('menu.settings')}</h2>
      <div className="gold-frame rounded-lg p-4 w-full max-w-md space-y-4">
        <div>
          <div className="text-sm gold-text mb-2">{t('common.language')}</div>
          <div className="flex gap-2">
            <button
              onClick={() => updateSettings({ lang: 'th' })}
              className={`flex-1 py-2 rounded ${settings.lang === 'th' ? 'bg-gold/30 text-gold-bright' : 'bg-black/20 text-gold-dim'}`}
            >
              ภาษาไทย
            </button>
            <button
              onClick={() => updateSettings({ lang: 'en' })}
              className={`flex-1 py-2 rounded ${settings.lang === 'en' ? 'bg-gold/30 text-gold-bright' : 'bg-black/20 text-gold-dim'}`}
            >
              English
            </button>
          </div>
        </div>

        <div>
          <div className="text-sm gold-text mb-2">{t('common.animSpeed')}</div>
          <div className="flex gap-2">
            {ANIM_DELAY_OPTIONS.map((ms) => (
              <button
                key={ms}
                onClick={() => updateSettings({ animDelayMs: ms })}
                className={`flex-1 py-2 rounded text-xs ${settings.animDelayMs === ms ? 'bg-gold/30 text-gold-bright' : 'bg-black/20 text-gold-dim'}`}
              >
                {(ms / 1000).toFixed(1)}
              </button>
            ))}
          </div>
          <div className="mt-1 text-xs text-gold-dim">{t('common.animSpeed.hint')}</div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.showBotIntents}
            onChange={(e) => updateSettings({ showBotIntents: e.target.checked })}
          />
          Bot intent hints
        </label>
      </div>
      <button onClick={() => setScreen('menu')} className="gold-frame rounded-lg px-6 py-2 hover:bg-gold/10">
        {t('common.back')}
      </button>
    </div>
  );
}
