import { useAppStore } from '@session/store';
import { interpolate, translate, type I18nKey, type Lang } from '@content/i18n';
import { tutorialTh } from '@content/i18n/tutorialTh';
import { tutorialEn } from '@content/i18n/tutorialEn';

/** The rulebook's copy is deliberately NOT part of the main dictionary.
 *
 *  At 53 KB of source it is 2.4x the size of every other string in the game put together, and it
 *  serves one screen that most sessions never open. Spreading it into `th.ts`/`en.ts` put all of it
 *  in the entry chunk — which made lazy-loading TutorialScreen almost pointless, since the screen's
 *  code split out but its text did not. Importing the two dictionaries from here instead means both
 *  land in the tutorial chunk with the screen that uses them.
 *
 *  The trade-off is this second hook. It resolves rulebook keys from its own dictionary and falls
 *  through to the shared one for everything else (`tutorial.title`, `game.armor`, `camp.market`,
 *  …), so call sites read exactly like `useT()` and no caller has to know which dictionary a key
 *  lives in. */

export type RulebookKey = keyof typeof tutorialTh;

const RULEBOOK: Record<Lang, Record<string, string>> = { th: tutorialTh, en: tutorialEn };

export function useRulebookT() {
  const lang = useAppStore((s) => s.settings.lang);
  return (key: RulebookKey | I18nKey, vars?: Record<string, string | number>): string => {
    const own = RULEBOOK[lang][key];
    return own === undefined ? translate(lang, key as I18nKey, vars) : interpolate(own, vars);
  };
}
