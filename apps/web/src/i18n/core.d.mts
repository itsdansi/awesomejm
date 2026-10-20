import type { TranslationKey, TranslationValue } from './schema';
export type { TranslationKey } from './schema';
export type Language = 'en' | 'ne';
export const defaultLanguage: Language;
export const supportedLanguages: readonly Language[];
export const catalogs: Record<Language, Record<TranslationKey, string>>;
export function interpolate(
  message: string,
  values?: Record<string, TranslationValue>,
): string;
export function translate(
  key: TranslationKey,
  values?: Record<string, TranslationValue>,
  language?: Language,
): string;
export function hasTranslation(
  key: string,
  language?: Language,
): key is TranslationKey;
export function resolveLanguage(
  saved: unknown,
  browserLanguage?: string,
): Language;
