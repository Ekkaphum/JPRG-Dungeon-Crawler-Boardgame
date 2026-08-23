import { th, type I18nKey } from './th';
import { en } from './en';

export type Lang = 'th' | 'en';
export type { I18nKey };

const DICTS: Record<Lang, Record<I18nKey, string>> = { th, en };

/** Substitutes `{name}` placeholders. Exported so the rulebook's own dictionary — which is split
 *  into the lazy tutorial chunk and therefore cannot go through `translate` — interpolates by
 *  exactly the same rule instead of reimplementing it. */
export function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  let out = s;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
}

export function translate(lang: Lang, key: I18nKey, vars?: Record<string, string | number>): string {
  return interpolate(DICTS[lang][key] ?? key, vars);
}
