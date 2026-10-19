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
      setError(parsed.error.issues.map((issue) => issue.message).join(' '));
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
      title={rate ? 'Revise a rate' : 'Set a metal rate'}
      eyebrow="Gold & silver rates"
      onClose={onClose}
      busy={busy}
    >
      <p className="dialog-description">
        {rate
          ? `This saves revision ${rate.revision + 1}. The previous rate stays in history.`
          : 'Record your shop’s quote for one metal and purity. Rates are entered manually in NPR per tola.'}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="form-grid" disabled={busy}>
          <label className="full-width">
            Rate date (AD)
            <input
              type="date"
              value={fields.rateDate}
              readOnly
              aria-readonly="true"
            />
          </label>
          <label>
            Metal
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
              <option value="GOLD">Gold · सुन</option>
              <option value="SILVER">Silver · चाँदी</option>
            </select>
          </label>
          <label>
            Purity / fineness (‰)
            <input
              required
              inputMode="decimal"
              {...field('fineness')}
              readOnly={Boolean(rate)}
            />
            <span className="field-hint">
              {fields.metal === 'GOLD'
                ? '22K ≈ 916.667‰ · 24K nominally 1000‰.'
                : 'Sterling silver is 925‰.'}{' '}
              Enter actual quoted purity.
            </span>
          </label>
          <label>
            Buying rate (NPR / tola)
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              {...field('buyRatePerTola')}
            />
            <span className="field-hint">The shop’s buying quote.</span>
          </label>
          <label>
            Selling rate (NPR / tola)
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              {...field('sellRatePerTola')}
            />
            <span className="field-hint">The shop’s selling quote.</span>
          </label>
          <div className="weight-preview full-width">
            <div>
              <span>Buying / gram ≈</span>
              <strong>{buyPreview}</strong>
            </div>
            <div>
              <span>Selling / gram ≈</span>
              <strong>{sellPreview}</strong>
            </div>
          </div>
          <p className="field-hint full-width rate-form-note">
            1 tola = 11.664 g. Per-gram values are rounded previews. The quote
            already applies to the stated purity.
          </p>
          <label className="full-width">
            Rate source / reference
            <input
              required
              maxLength={160}
              {...field('source')}
              placeholder="Shop-set rate or source reference"
            />
          </label>
          <label className="full-width">
            {rate ? 'Reason for revision' : 'Notes (optional)'}
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
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : rate ? 'Save revision' : 'Save rate'}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
