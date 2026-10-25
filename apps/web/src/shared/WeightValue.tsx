import {
  DEFAULT_GRAMS_PER_TOLA,
  gramsToTolaLal,
} from '@awesomejm/calculations';
import { t, useLanguage } from '../i18n/language';
export function WeightValue({
  grams,
  gramsPerTola = DEFAULT_GRAMS_PER_TOLA,
  stacked = false,
  localOnly = false,
}: {
  grams: string;
  gramsPerTola?: string;
  stacked?: boolean;
  localOnly?: boolean;
}) {
  useLanguage();
  let local;
  try {
    local = gramsToTolaLal(grams, gramsPerTola);
  } catch {
    return <>—</>;
  }
  return (
    <span className={`weight-value ${stacked ? 'weight-stacked' : ''}`}>
      <span>
        {local.approximate ? '≈ ' : ''}
        {local.negative ? '-' : ''}
        {t('weights.tolaLal', { tola: local.tola, lal: local.lal })}
      </span>
      {!localOnly && (
        <span className="weight-grams">
          {' '}
          {t('weights.gramsInBrackets', { grams })}
        </span>
      )}
    </span>
  );
}
