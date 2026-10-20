import { useSyncExternalStore } from 'react';
import { translate, resolveLanguage, type Language } from './core.mjs';
import { translateMessage } from './messages.mjs';
import type {
  TranslationArgs,
  TranslationKey,
  TranslationValue,
} from './schema';
export type { TranslationKey } from './schema';
const key = 'awesomejm.language';
function initialLanguage(): Language {
  try {
    const saved = globalThis.localStorage.getItem(key);
    if (saved === 'en' || saved === 'ne') return resolveLanguage(saved);
  } catch {
    /* Storage may be disabled. */
  }
  return resolveLanguage(null, globalThis.navigator?.language);
}
let language = initialLanguage();
const listeners = new Set<() => void>();
function updateDocument() {
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
}
updateDocument();
export function getLanguage() {
  return language;
}
export function setLanguage(value: Language) {
  if (value === language) return;
  language = value;
  updateDocument();
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    /* Keep the in-memory choice usable. */
  }
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, () => 'en' as const);
}
globalThis.addEventListener('storage', (event) => {
  if (
    event.key === key &&
    (event.newValue === 'en' || event.newValue === 'ne')
  ) {
    language = event.newValue;
    updateDocument();
    for (const listener of listeners) listener();
  }
});
export function t<K extends TranslationKey>(
  value: K,
  ...args: TranslationArgs<K>
): string;
export function t<K extends TranslationKey>(
  value: K | undefined,
  ...args: TranslationArgs<K>
): string | undefined;
export function t(
  value: TranslationKey | undefined,
  values?: Record<string, TranslationValue>,
) {
  return value === undefined ? undefined : translate(value, values, language);
}
export const message = (value: string) => translateMessage(value, language);
export const locale = () => (language === 'ne' ? 'ne-NP-u-nu-latn' : 'en-NP');
