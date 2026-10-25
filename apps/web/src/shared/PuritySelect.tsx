import { useId, useState } from 'react';
import {
  GOLD_PURITY_PRESETS,
  finenessToPercentage,
  goldPurityPreset,
} from '@awesomejm/calculations';
import { t, useLanguage } from '../i18n/language';

type Props = {
  metal: 'GOLD' | 'SILVER';
  value: string;
  onChange: (fineness: string) => void;
  label: string;
  ariaLabel?: string;
  readOnly?: boolean;
};
export function PuritySelect(props: Props) {
  useLanguage();
  return (
    <div className="purity-selector">
      {props.metal === 'GOLD' ? (
        <GoldPurity {...props} />
      ) : (
        <>
          <FinenessInput {...props} />
          <PurityPercentage value={props.value} />
        </>
      )}
    </div>
  );
}
function GoldPurity(props: Props) {
  const [custom, setCustom] = useState(
    () => goldPurityPreset(props.value) === undefined,
  );
  const preset = goldPurityPreset(props.value);
  const selected = custom ? 'CUSTOM' : (preset?.fineness ?? 'CUSTOM');
  return (
    <>
      <label>
        {props.label}
        <select
          aria-label={props.ariaLabel ?? props.label}
          value={selected}
          disabled={props.readOnly}
          onChange={(event) => {
            if (props.readOnly) return;
            const chosen = GOLD_PURITY_PRESETS.find(
              (entry) => entry.fineness === event.target.value,
            );
            setCustom(!chosen);
            if (chosen) props.onChange(chosen.fineness);
          }}
        >
          {GOLD_PURITY_PRESETS.map((entry) => (
            <option key={entry.fineness} value={entry.fineness}>
              {t('purity.presetOption', {
                karat: entry.karat,
                fineness: entry.fineness,
              })}
            </option>
          ))}
          <option value="CUSTOM">{t('purity.custom')}</option>
        </select>
      </label>
      {selected === 'CUSTOM' && (
        <FinenessInput
          {...props}
          label={t('purity.assayedFineness')}
          onChange={(value) => {
            setCustom(true);
            props.onChange(value);
          }}
        />
      )}
      <PurityPercentage value={props.value} />
    </>
  );
}
function FinenessInput({ value, onChange, label, ariaLabel, readOnly }: Props) {
  const id = useId();
  return (
    <label htmlFor={id}>
      {label}
      <input
        id={id}
        aria-label={
          ariaLabel ? t('purity.customFor', { field: ariaLabel }) : label
        }
        required
        inputMode="decimal"
        maxLength={8}
        pattern="[0-9]{1,4}([.][0-9]{1,3})?"
        value={value}
        readOnly={readOnly}
        aria-readonly={readOnly}
        onChange={(event) => {
          if (!readOnly) onChange(event.target.value);
        }}
      />
    </label>
  );
}
function PurityPercentage({ value }: { value: string }) {
  let percent;
  try {
    percent = finenessToPercentage(value);
  } catch {
    /* Incomplete or invalid fineness. */
  }
  return (
    <output className="purity-percentage" aria-live="polite">
      {percent === undefined
        ? t('purity.invalidFineness')
        : t('purity.percentage', { percent })}
    </output>
  );
}
