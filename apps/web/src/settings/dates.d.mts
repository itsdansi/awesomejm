import type { DisplaySettings } from '@awesomejm/contracts';
export function displayDate(
  value: string | null | undefined,
  settings: DisplaySettings,
  language?: string,
): string;
export function displayTime(
  value: string | null | undefined,
  settings: DisplaySettings,
  language?: string,
): string;
export function displayPeriod(
  value: string,
  settings: DisplaySettings,
  language?: string,
  range?: { from: string; to: string },
): string;
