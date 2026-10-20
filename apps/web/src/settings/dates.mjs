import NepaliDate from 'nepali-date-converter';
import { translate } from '../i18n/core.mjs';

const pad = (value) => String(value).padStart(2, '0');
const label = (calendar, language) =>
  translate(`settings.calendarLabels.${calendar.toLowerCase()}`, {}, language);

// Civil business dates are deliberately never interpreted as instants.
export function displayDate(value, settings, language = 'en') {
  if (!value) return '—';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  if (settings.calendar === 'BS' && value >= '1943-04-14') {
    try {
      // The converter reads local civil fields, so construct a local date, not UTC midnight.
      const converted = new NepaliDate(new Date(year, month - 1, day, 12));
      const ad = converted.getAD();
      if (ad.year === year && ad.month === month - 1 && ad.date === day) {
        const bs = converted.getBS();
        return `${bs.year}-${pad(bs.month + 1)}-${pad(bs.date)} ${label('BS', language)}`;
      }
    } catch {
      /* Outside the lookup table: retain the exact AD date. */
    }
  }
  return `${value} ${label('AD', language)}`;
}

export function displayTime(value, settings, language = 'en') {
  if (!value) return '—';
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: settings.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const clock = new Intl.DateTimeFormat(
    language === 'ne' ? 'ne-NP-u-nu-latn' : 'en-NP',
    {
      timeZone: settings.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: settings.hourCycle,
    },
  ).format(instant);
  return `${displayDate(date, settings, language)} · ${clock} · ${settings.timeZone}`;
}

// Monthly accounting buckets stay Gregorian. Show their real endpoints in BS,
// rather than incorrectly relabelling an AD month as a BS month.
export function displayPeriod(value, settings, language = 'en', range) {
  if (!/^\d{4}-\d{2}$/.test(value))
    return displayDate(value, settings, language);
  if (settings.calendar === 'AD') return `${value} ${label('AD', language)}`;
  const [year, month] = value.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = `${value}-01`;
  const last = `${value}-${pad(end)}`;
  const from = range && range.from > first ? range.from : first;
  const to = range && range.to < last ? range.to : last;
  return `${displayDate(from, settings, language)} — ${displayDate(to, settings, language)}`;
}
