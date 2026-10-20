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
      title={
        rate
          ? t('rates.rateForm.reviseARate')
          : t('rates.rateForm.setAMetalRate')
      }
      eyebrow={t('rates.labels.goldSilverRates')}
      onClose={onClose}
      busy={busy}
    >
      <p className="dialog-description">
        {rate
          ? t('rates.rateForm.thisSavesRevisionThePreviousRateStaysIn', {
              revision: rate.revision + 1,
            })
          : t('rates.rateForm.recordYourShopSQuoteForOneMetal')}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="form-grid" disabled={busy}>
          <label className="full-width">
            {t('rates.labels.rateDateAd')}
            <input
              type="date"
              value={fields.rateDate}
              readOnly
              aria-readonly="true"
            />
          </label>
          <label>
            {t('common.labels.metal')}
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
              <option value="GOLD">{t('common.labels.gold')}</option>
              <option value="SILVER">{t('common.labels.silver')}</option>
            </select>
          </label>
          <label>
            {t('common.labels.purityFineness')}
            <input
              required
              inputMode="decimal"
              {...field('fineness')}
              readOnly={Boolean(rate)}
            />
            <span className="field-hint">
              {fields.metal === 'GOLD'
                ? t('rates.rateForm.purityHelp')
                : t('rates.rateForm.sterlingSilverIs925')}{' '}
              {t('rates.rateForm.enterActualQuotedPurity')}
            </span>
          </label>
          <label>
            {t('rates.rateForm.buyingRateNprTola')}
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              {...field('buyRatePerTola')}
            />
            <span className="field-hint">
              {t('rates.rateForm.theShopSBuyingQuote')}
            </span>
          </label>
          <label>
            {t('rates.rateForm.sellingRateNprTola')}
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              {...field('sellRatePerTola')}
            />
            <span className="field-hint">
              {t('rates.rateForm.theShopSSellingQuote')}
            </span>
          </label>
          <div className="weight-preview full-width">
            <div>
              <span>{t('rates.rateForm.buyingGram')}</span>
              <strong>{buyPreview}</strong>
            </div>
            <div>
              <span>{t('rates.rateForm.sellingGram')}</span>
              <strong>{sellPreview}</strong>
            </div>
          </div>
          <p className="field-hint full-width rate-form-note">
            {t('rates.rateForm.perGramPreviewHelp')}
          </p>
          <label className="full-width">
            {t('rates.rateForm.rateSourceReference')}
            <input
              required
              maxLength={160}
              {...field('source')}
              placeholder={t('rates.rateForm.shopSetRateOrSourceReference')}
            />
          </label>
          <label className="full-width">
            {rate
              ? t('rates.rateForm.reasonForRevision')
              : t('common.labels.notesOptional')}
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
            {t('common.actions.cancel')}
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? t('common.actions.saving')
              : rate
                ? t('rates.rateForm.saveRevision')
                : t('rates.rateForm.saveRate')}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
