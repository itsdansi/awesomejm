import NepaliDate from 'nepali-date-converter';
import { translate } from '../i18n/core.mjs';

const pad = (value) => String(value).padStart(2, '0');
const label = (calendar, language) =>
  translate(`settings.calendarLabels.${calendar.toLowerCase()}`, {}, language);

export function toAD(date) {
  const ad = date.getAD();
  return `${ad.year}-${pad(ad.month + 1)}-${pad(ad.date)}`;
}

export function toBS(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1943-04-14') return null;
  const [year, month, day] = value.split('-').map(Number);
  try {
    // The converter reads local civil fields, so construct a local date, not UTC midnight.
    const converted = new NepaliDate(new Date(year, month - 1, day, 12));
    return toAD(converted) === value ? converted : null;
  } catch {
    return null;
  }
}

export function displayDate(value, settings, language = 'en') {
  if (!value) return '—';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const bs = settings.calendar === 'BS' && toBS(value);
  if (bs) return `${bs.format('YYYY-MM-DD', 'en')} ${label('BS', language)}`;
  return `${value} ${label('AD', language)}`;
}

export function reportDateRange(today, calendar, preset) {
  function monthStart(value) {
    const bs = calendar === 'BS' && toBS(value);
    return bs
      ? toAD(new NepaliDate(bs.getYear(), bs.getMonth(), 1))
      : `${value.slice(0, 7)}-01`;
  }
  if (preset === 'today') return { from: today, to: today };
  const start = monthStart(today);
  if (preset === 'month') return { from: start, to: today };
  const previous = new Date(`${start}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const to = previous.toISOString().slice(0, 10);
  return { from: monthStart(to), to };
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
