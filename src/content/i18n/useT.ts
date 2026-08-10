import { useAppStore } from '@session/store';
import { translate, type I18nKey } from './index';

export function useT() {
  const lang = useAppStore((s) => s.settings.lang);
  return (key: I18nKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
