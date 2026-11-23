import { useId, useState } from 'react';
import NepaliDate from 'nepali-date-converter';
import { useAuth } from '../auth/AuthContext';
import { t, useLanguage } from '../i18n/language';
import { Dialog, Icon } from '../shared/ui';
import { toAD, toBS } from './dates.mjs';

type DateFilterProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max: string;
  required?: boolean;
};

export function DateFilter({
  label,
  value,
  onChange,
  min: from,
  max,
  required = false,
}: DateFilterProps) {
  useLanguage();
  const { user } = useAuth();
  const id = useId();
  const [open, setOpen] = useState(false);
  const min = from || '2000-01-01';
  const prefersBS = user.displaySettings.calendar === 'BS';
  const earliest = prefersBS ? toBS(min) : null;
  const latest = prefersBS ? toBS(max) : null;
  const selected = prefersBS && value ? toBS(value) : null;
  const showBS = earliest && latest && min <= max && (!value || selected);
  const title = t('common.dates.filterLabel', {
    label,
    calendar: t(
      showBS ? 'settings.calendarLabels.bs' : 'settings.calendarLabels.ad',
    ),
  });

  return (
    <div className="date-filter">
      <label htmlFor={id} id={`${id}-label`}>
        {title}
      </label>
      {showBS ? (
        <>
          <button
            type="button"
            id={id}
            className="bs-date-trigger"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-labelledby={`${id}-label ${id}-value`}
            onClick={() => setOpen(true)}
          >
            <span id={`${id}-value`}>
              {selected?.format('YYYY-MM-DD', 'en') ?? t('common.dates.choose')}
            </span>
            <Icon name="calendar" size={16} />
          </button>
          {open && (
            <Dialog title={title} onClose={() => setOpen(false)}>
              <BsCalendar
                earliest={earliest}
                latest={latest}
                selected={selected}
                clearable={!required && !!value}
                onSelect={(date) => {
                  onChange(date);
                  setOpen(false);
                }}
              />
            </Dialog>
          )}
        </>
      ) : (
        <input
          id={id}
          type="date"
          min={min}
          max={max}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

function BsCalendar({
  earliest,
  latest,
  selected,
  clearable,
  onSelect,
}: {
  earliest: NepaliDate;
  latest: NepaliDate;
  selected: NepaliDate | null;
  clearable: boolean;
  onSelect: (date: string) => void;
}) {
  const language = useLanguage() === 'ne' ? 'np' : 'en';
  const min = toAD(earliest);
  const max = toAD(latest);
  const value = selected ? toAD(selected) : '';
  const initial = selected && value >= min && value <= max ? selected : latest;
  const [year, setYear] = useState(initial.getYear());
  const [month, setMonth] = useState(initial.getMonth());
  const firstYear = earliest.getYear();
  const lastYear = latest.getYear();
  const firstMonth = year === firstYear ? earliest.getMonth() : 0;
  const lastMonth = year === lastYear ? latest.getMonth() : 11;
  const visibleMonth = Math.min(lastMonth, Math.max(firstMonth, month));
  const firstDay = new NepaliDate(year, visibleMonth, 1);
  // The final eligible month can end at today's date or the other range endpoint.
  const lastDay =
    year === lastYear && visibleMonth === lastMonth
      ? latest.getDate()
      : new NepaliDate(year, visibleMonth + 1, 0).getDate();
  const dayNames = Array.from({ length: 7 }, (_, i) =>
    new NepaliDate(
      year,
      visibleMonth,
      1 + ((7 + i - firstDay.getDay()) % 7),
    ).format('dd', language),
  );
  return (
    <div className="bs-calendar">
      <div className="bs-calendar-controls">
        <select
          aria-label={t('common.dates.month')}
          value={visibleMonth}
          onChange={(event) => setMonth(Number(event.target.value))}
        >
          {Array.from({ length: lastMonth - firstMonth + 1 }, (_, i) => {
            const index = firstMonth + i;
            return (
              <option key={index} value={index}>
                {new NepaliDate(year, index, 1).format('MMMM', language)}
              </option>
            );
          })}
        </select>
        <select
          aria-label={t('common.dates.year')}
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        >
          {Array.from({ length: lastYear - firstYear + 1 }, (_, i) => (
            <option key={i} value={lastYear - i}>
              {lastYear - i}
            </option>
          ))}
        </select>
      </div>
      <div className="bs-calendar-days">
        {dayNames.map((day) => (
          <span key={day} aria-hidden="true">
            {day}
          </span>
        ))}
        {Array.from({ length: lastDay }, (_, i) => {
          const date = new NepaliDate(year, visibleMonth, i + 1);
          const ad = toAD(date);
          return (
            <button
              type="button"
              key={i}
              style={
                i === 0 ? { gridColumnStart: firstDay.getDay() + 1 } : undefined
              }
              disabled={ad < min || ad > max}
              aria-pressed={ad === value}
              aria-label={date.format('D MMMM YYYY', language)}
              onClick={() => onSelect(ad)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      {clearable && (
        <button
          type="button"
          className="text-button"
          onClick={() => onSelect('')}
        >
          {t('common.dates.clear')}
        </button>
      )}
    </div>
  );
}
