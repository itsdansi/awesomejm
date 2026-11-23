import type { DisplaySettings } from '@awesomejm/contracts';
import type NepaliDate from 'nepali-date-converter';
export function toAD(date: NepaliDate): string;
export function toBS(value: string): NepaliDate | null;
export function reportDateRange(
  today: string,
  calendar: DisplaySettings['calendar'],
  preset: 'today' | 'month' | 'previous',
): { from: string; to: string };
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
