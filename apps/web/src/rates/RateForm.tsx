import { t, message, useLanguage } from '../i18n/language';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ratePerGram } from '@awesomejm/calculations';
import {
  metalRateSchema,
  publishRateSchema,
  type MetalRate,
} from '@awesomejm/contracts';
import { errorMessage, request } from '../shared/api';
import { Dialog, Icon } from '../shared/ui';

export function RateForm({
  date,
  rate,
  initialMetal = 'GOLD',
  onClose,
  onSaved,
}: {
  date: string;
  rate?: MetalRate;
  initialMetal?: MetalRate['metal'];
  onClose: () => void;
  onSaved: () => void;
}) {
  useLanguage();

  const [fields, setFields] = useState({
    rateDate: rate?.rateDate ?? date,
    metal: rate?.metal ?? initialMetal,
    fineness: rate?.fineness ?? (initialMetal === 'SILVER' ? '925' : '916.667'),
    buyRatePerTola: rate?.buyRatePerTola ?? '',
    sellRatePerTola: rate?.sellRatePerTola ?? '',
    source: rate?.source ?? 'Shop-set rate',
    reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = (name: keyof typeof fields) => ({
    value: fields[name],
    onChange: (
      event: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => setFields({ ...fields, [name]: event.target.value }),
  });
  let buyPreview = '—',
    sellPreview = '—';
  try {
    buyPreview = `NPR ${ratePerGram(fields.buyRatePerTola)}`;
  } catch {
    /* Incomplete input. */
  }
  try {
    sellPreview = `NPR ${ratePerGram(fields.sellRatePerTola)}`;
  } catch {
    /* Incomplete input. */
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = publishRateSchema.safeParse({
      ...fields,
      expectedRevision: rate?.revision ?? 0,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('\n'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request('/rates', metalRateSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      onSaved();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={rate ? t('Revise a rate') : t('Set a metal rate')}
      eyebrow={t('Gold & silver rates')}
      onClose={onClose}
      busy={busy}
    >
      <p className="dialog-description">
        {rate
          ? t(
              'This saves revision {value0}. The previous rate stays in history.',
              { value0: rate.revision + 1 },
            )
          : t(
              'Record your shop’s quote for one metal and purity. Rates are entered manually in NPR per tola.',
            )}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="form-grid" disabled={busy}>
          <label className="full-width">
            {t('Rate date (AD)')}
            <input
              type="date"
              value={fields.rateDate}
              readOnly
              aria-readonly="true"
            />
          </label>
          <label>
            {t('Metal')}
            <select
              {...field('metal')}
              disabled={Boolean(rate)}
              onChange={(event) =>
                setFields({
                  ...fields,
                  metal: event.target.value as MetalRate['metal'],
                  fineness: event.target.value === 'SILVER' ? '925' : '916.667',
                })
              }
            >
              <option value="GOLD">{t('Gold · सुन')}</option>
              <option value="SILVER">{t('Silver · चाँदी')}</option>
            </select>
          </label>
          <label>
            {t('Purity / fineness (‰)')}
            <input
              required
              inputMode="decimal"
              {...field('fineness')}
              readOnly={Boolean(rate)}
            />
            <span className="field-hint">
              {fields.metal === 'GOLD'
                ? t('22K ≈ 916.667‰ · 24K nominally 1000‰.')
                : t('Sterling silver is 925‰.')}{' '}
              {t('Enter actual quoted purity.')}
            </span>
          </label>
          <label>
            {t('Buying rate (NPR / tola)')}
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              {...field('buyRatePerTola')}
            />
            <span className="field-hint">{t('The shop’s buying quote.')}</span>
          </label>
          <label>
            {t('Selling rate (NPR / tola)')}
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              {...field('sellRatePerTola')}
            />
            <span className="field-hint">{t('The shop’s selling quote.')}</span>
          </label>
          <div className="weight-preview full-width">
            <div>
              <span>{t('Buying / gram ≈')}</span>
              <strong>{buyPreview}</strong>
            </div>
            <div>
              <span>{t('Selling / gram ≈')}</span>
              <strong>{sellPreview}</strong>
            </div>
          </div>
          <p className="field-hint full-width rate-form-note">
            {t(
              '1 tola = 11.664 g. Per-gram values are rounded previews. The quote already applies to the stated purity.',
            )}
          </p>
          <label className="full-width">
            {t('Rate source / reference')}
            <input
              required
              maxLength={160}
              {...field('source')}
              placeholder={t('Shop-set rate or source reference')}
            />
          </label>
          <label className="full-width">
            {rate ? t('Reason for revision') : t('Notes (optional)')}
            <textarea
              required={Boolean(rate)}
              minLength={rate ? 5 : undefined}
              maxLength={500}
              rows={2}
              {...field('reason')}
            />
          </label>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {message(error)}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {t('Cancel')}
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? t('Saving…') : rate ? t('Save revision') : t('Save rate')}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
