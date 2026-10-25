import { useId, useState } from 'react';
import {
  DEFAULT_GRAMS_PER_TOLA,
  gramsToTolaLal,
  tolaLalToGrams,
} from '@awesomejm/calculations';
import { t, useLanguage } from '../i18n/language';

const canonicalGrams = /^(0|[1-9]\d{0,8})(\.\d{1,3})?$/;

export function WeightInput({
  label,
  ariaLabel = label,
  value,
  onChange,
  gramsPerTola = DEFAULT_GRAMS_PER_TOLA,
}: {
  label: string;
  ariaLabel?: string;
  value: string;
  onChange: (grams: string) => void;
  gramsPerTola?: string | undefined;
}) {
  useLanguage();
  const id = useId();
  const [unit, setUnit] = useState<'GRAMS' | 'TOLA_LAL'>('GRAMS');
  const [draft, setDraft] = useState<{
    grams: string;
    tola: string;
    lal: string;
    invalid: boolean;
  } | null>(null);
  let parts = { tola: '0', lal: '0.00' };
  try {
    if (canonicalGrams.test(value)) parts = gramsToTolaLal(value, gramsPerTola);
  } catch {
    /* Incomplete input. */
  }
  const fields =
    draft?.grams === value
      ? draft
      : { ...parts, invalid: value !== '' && !canonicalGrams.test(value) };
  function change(tola: string, lal: string) {
    let grams: string;
    let invalid = false;
    try {
      grams = tolaLalToGrams(tola, lal, gramsPerTola);
      if (!canonicalGrams.test(grams)) throw new RangeError();
    } catch {
      invalid = true;
      grams = '';
    }
    setDraft({ grams, tola, lal, invalid });
    onChange(grams);
  }
  return (
    <div className="weight-input">
      <div className="weight-input-heading">
        <span id={`${id}-label`}>{label}</span>
        <select
          aria-label={t('weights.entryUnitFor', { field: ariaLabel })}
          value={unit}
          onChange={(event) => {
            setUnit(event.target.value as typeof unit);
            setDraft(null);
          }}
        >
          <option value="GRAMS">{t('weights.grams')}</option>
          <option value="TOLA_LAL">{t('weights.tolaLalUnit')}</option>
        </select>
      </div>
      {unit === 'GRAMS' ? (
        <input
          aria-label={t('weights.gramsFor', { field: ariaLabel })}
          aria-describedby={`${id}-hint`}
          required
          inputMode="decimal"
          maxLength={13}
          pattern="(0|[1-9][0-9]{0,8})([.][0-9]{1,3})?"
          placeholder="0.000"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="tola-lal-inputs">
          <label>
            {t('weights.tola')}
            <input
              aria-label={t('weights.tolaFor', { field: ariaLabel })}
              aria-describedby={`${id}-hint`}
              required
              inputMode="numeric"
              maxLength={9}
              pattern="(0|[1-9][0-9]{0,8})"
              value={fields.tola}
              onChange={(event) => change(event.target.value, fields.lal)}
            />
          </label>
          <label>
            {t('weights.lal')}
            <input
              aria-label={t('weights.lalFor', { field: ariaLabel })}
              aria-describedby={`${id}-hint`}
              required
              inputMode="decimal"
              maxLength={5}
              pattern="(0|[1-9][0-9]?)([.][0-9]{1,2})?"
              value={fields.lal}
              onChange={(event) => change(fields.tola, event.target.value)}
            />
          </label>
        </div>
      )}
      <small
        className={`field-hint${unit === 'TOLA_LAL' && fields.invalid ? ' error' : ''}`}
        id={`${id}-hint`}
      >
        {unit === 'TOLA_LAL' ? (
          fields.invalid ? (
            t('weights.invalidEntry')
          ) : value ? (
            t('weights.storedGrams', { grams: value })
          ) : (
            '—'
          )
        ) : (
          <WeightEquivalent grams={value} gramsPerTola={gramsPerTola} />
        )}
      </small>
    </div>
  );
}

function WeightEquivalent({
  grams,
  gramsPerTola,
}: {
  grams: string;
  gramsPerTola: string;
}) {
  if (!canonicalGrams.test(grams)) return <>{'—'}</>;
  let parts;
  try {
    parts = gramsToTolaLal(grams, gramsPerTola);
  } catch {
    return <>—</>;
  }
  return (
    <>
      {parts.approximate ? '≈ ' : ''}
      {t('weights.tolaLal', { tola: parts.tola, lal: parts.lal })}
    </>
  );
}
