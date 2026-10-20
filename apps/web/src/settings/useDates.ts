import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/language';
import { displayDate, displayTime, displayPeriod } from './dates.mjs';

export function useDates() {
  const { user } = useAuth();
  const language = useLanguage();
  return {
    date: (value: string | null | undefined) =>
      displayDate(value, user.displaySettings, language),
    time: (value: string | null | undefined) =>
      displayTime(value, user.displaySettings, language),
    period: (value: string, range?: { from: string; to: string }) =>
      displayPeriod(value, user.displaySettings, language, range),
  };
}
