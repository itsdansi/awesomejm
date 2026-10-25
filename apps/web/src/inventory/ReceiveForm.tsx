import { WeightValue } from '../shared/WeightValue';
import { WeightInput } from '../shared/WeightInput';
import { t, message, useLanguage } from '../i18n/language';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { inventoryWeights } from '@awesomejm/calculations';
import { inventoryItemSchema, receiveItemSchema } from '@awesomejm/contracts';
import { errorMessage, request } from './api';
import { Dialog, Icon } from './ui';

export function ReceiveForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  useLanguage();

  const [fields, setFields] = useState({
    itemCode: '',
    name: '',
    category: '',
    metal: 'GOLD',
    fineness: '916.667',
    grossWeightGrams: '',
    nonMetalWeightGrams: '0',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  let preview: ReturnType<typeof inventoryWeights> | null = null;
  try {
    preview = inventoryWeights(
      fields.grossWeightGrams,
      fields.nonMetalWeightGrams,
      fields.fineness,
    );
  } catch {
    /* Incomplete form has no weight preview. */
  }
  const field = (name: keyof typeof fields) => ({
    value: fields[name],
    onChange: (
      event: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => setFields({ ...fields, [name]: event.target.value }),
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = receiveItemSchema.safeParse(fields);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(' ')}: ${issue.message}`)
          .join(' '),
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request('/items', inventoryItemSchema, {
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
      title={t('inventory.receiveForm.title')}
      onClose={onClose}
      busy={busy}
    >
      <p className="dialog-description">
        {t('inventory.receiveForm.description')}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy} className="form-grid">
          <label>
            {t('inventory.fields.itemCode')}
            <input
              autoFocus
              required
              maxLength={40}
              placeholder={t('inventory.receiveForm.itemCodePlaceholder')}
              {...field('itemCode')}
            />
          </label>
          <label>
            {t('inventory.labels.category')}
            <input
              required
              maxLength={60}
              placeholder={t('inventory.receiveForm.categoryPlaceholder')}
              {...field('category')}
              list="categories"
            />
          </label>
          <datalist id="categories">
            <option value="Ring">{t('inventory.receiveForm.ring')}</option>
            <option value="Necklace">
              {t('inventory.receiveForm.necklace')}
            </option>
            <option value="Earrings">
              {t('inventory.receiveForm.earrings')}
            </option>
            <option value="Bangle">{t('inventory.receiveForm.bangle')}</option>
            <option value="Chain">{t('inventory.receiveForm.chain')}</option>
            <option value="Coin">{t('inventory.receiveForm.coin')}</option>
          </datalist>
          <label className="full-width">
            {t('inventory.receiveForm.itemName')}
            <input
              required
              maxLength={120}
              placeholder={t('inventory.receiveForm.namePlaceholder')}
              {...field('name')}
            />
          </label>
          <label>
            {t('common.labels.metal')}
            <select {...field('metal')}>
              <option value="GOLD">{t('common.labels.gold')}</option>
              <option value="SILVER">{t('common.labels.silver')}</option>
            </select>
          </label>
          <label>
            {t('common.labels.purityFineness')}
            <input
              required
              inputMode="decimal"
              placeholder={t('inventory.receiveForm.purityPlaceholder')}
              {...field('fineness')}
            />
            <span className="field-hint">
              {t('inventory.receiveForm.purityHelp')}
            </span>
          </label>
          <WeightInput
            label={t('weights.fields.gross')}
            value={fields.grossWeightGrams}
            onChange={(value) =>
              setFields({ ...fields, grossWeightGrams: value })
            }
          />
          <WeightInput
            label={t('weights.fields.nonMetal')}
            value={fields.nonMetalWeightGrams}
            onChange={(value) =>
              setFields({ ...fields, nonMetalWeightGrams: value })
            }
          />
          <div className="weight-preview full-width">
            <div>
              <span>{t('inventory.labels.netMetalWeight')}</span>
              <strong>
                {preview ? <WeightValue grams={preview.netWeightGrams} /> : '—'}
              </strong>
            </div>
            <div>
              <span>{t('inventory.labels.fineMetalEquivalent')}</span>
              <strong>
                {preview ? (
                  <WeightValue grams={preview.fineWeightGrams} />
                ) : (
                  '—'
                )}
              </strong>
            </div>
          </div>
          <label className="full-width">
            {t('common.labels.notesOptional')}
            <textarea
              rows={2}
              maxLength={1000}
              placeholder={t(
                'inventory.receiveForm.designSizeOrReceiptReference',
              )}
              {...field('notes')}
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
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            {t('common.actions.cancel')}
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? t('common.actions.saving')
              : t('inventory.receiveForm.receivePiece')}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
