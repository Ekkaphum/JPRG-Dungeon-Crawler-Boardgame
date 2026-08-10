import { th, type I18nKey } from './th';
import { en } from './en';

export type Lang = 'th' | 'en';
export type { I18nKey };

const DICTS: Record<Lang, Record<I18nKey, string>> = { th, en };

export function translate(lang: Lang, key: I18nKey, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}
