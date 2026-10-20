export type Language = 'en' | 'ne';
export const supportedLanguages: readonly Language[];
export const translationCatalog: Record<string, string>;
export function interpolate(
  message: string,
  values?: Record<string, string | number | bigint>,
): string;
export function translate(
  message: string,
  values?: Record<string, string | number | bigint>,
  language?: Language,
): string;
export function translateMessage(message: string, language?: Language): string;
export function hasTranslation(message: string): boolean;

export function resolveLanguage(
  saved: unknown,
  browserLanguage?: string,
): Language;
