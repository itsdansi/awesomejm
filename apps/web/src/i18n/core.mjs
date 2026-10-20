import { resources } from './resources.mjs';
export const supportedLanguages = Object.keys(resources);
export const defaultLanguage = 'en';
const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);
function flatten(tree, prefix = '') {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) => {
      const id = prefix ? `${prefix}.${key}` : key;
      return typeof value === 'string'
        ? [[id, value]]
        : Object.entries(flatten(value, id));
    }),
  );
}
export const catalogs = Object.fromEntries(
  Object.entries(resources).map(([language, namespaces]) => [
    language,
    flatten(namespaces),
  ]),
);
export function resolveLanguage(saved, browserLanguage = 'en') {
  return supportedLanguages.includes(saved)
    ? saved
    : browserLanguage.toLowerCase().startsWith('ne')
      ? 'ne'
      : defaultLanguage;
}
export function interpolate(text, values = {}) {
  return text.replace(/\{([a-zA-Z][\w]*)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
export function hasTranslation(key, language = defaultLanguage) {
  return (
    !key.split('.').some((part) => dangerousKeys.has(part)) &&
    Object.hasOwn(catalogs, language) &&
    Object.hasOwn(catalogs[language], key)
  );
}
export function translate(key, values = {}, language = defaultLanguage) {
  // Missing locale entries fall back to English. Unknown keys remain visible for diagnosis.
  const catalog = hasTranslation(key, language)
    ? catalogs[language]
    : catalogs[defaultLanguage];
  return interpolate(
    hasTranslation(key, language) || hasTranslation(key) ? catalog[key] : key,
    values,
  );
}
