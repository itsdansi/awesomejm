import { WeightValue } from '../shared/WeightValue';
import { TimeValue } from '../settings/DateValue';
import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
import { useEffect, useState, type FormEvent } from 'react';
import {
  inventoryHistorySchema,
  inventoryItemSchema,
  voidReceiptSchema,
  type InventoryHistory,
  type InventoryItem,
} from '@awesomejm/contracts';
import { errorMessage, request } from './api';
import { Dialog, Icon } from './ui';

export function ItemDetails({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLanguage();

  const [history, setHistory] = useState<InventoryHistory | null>(null);
  const [reason, setReason] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void request(`/items/${item.id}/history`, inventoryHistorySchema, {
      signal: controller.signal,
    })
      .then(setHistory)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [item.id]);
  async function voidReceipt(event: FormEvent) {
    event.preventDefault();
    const parsed = voidReceiptSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a reason.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request(`/items/${item.id}/void`, inventoryItemSchema, {
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
    <Dialog title={item.name} onClose={onClose} busy={busy}>
      <div className="detail-meta">
        <code>{item.itemCode}</code>
        <span className={`metal-badge ${item.metal.toLowerCase()}`}>
          {item.metal === 'GOLD'
            ? t('common.metals.gold')
            : t('common.metals.silver')}
        </span>
        <span className="muted">
          {item.status === 'AVAILABLE'
            ? t('inventory.itemDetails.available')
            : item.status === 'SOLD'
              ? t('inventory.itemDetails.sold')
              : t('inventory.itemDetails.voidedReceipt')}
        </span>
      </div>
      <dl className="details-grid">
        <div>
          <dt>{t('inventory.labels.category')}</dt>
          <dd>{item.category}</dd>
        </div>
        <div>
          <dt>{t('common.fields.purity')}</dt>
          <dd>{item.fineness}‰</dd>
        </div>
        <div>
          <dt>{t('common.fields.grossWeight')}</dt>
          <dd>
            <WeightValue
              grams={item.grossWeightGrams}
              gramsPerTola={item.gramsPerTola}
            />
          </dd>
        </div>
        <div>
          <dt>{t('common.fields.nonMetalWeight')}</dt>
          <dd>
            <WeightValue
              grams={item.nonMetalWeightGrams}
              gramsPerTola={item.gramsPerTola}
            />
          </dd>
        </div>
        <div>
          <dt>{t('inventory.labels.netMetalWeight')}</dt>
          <dd>
            <WeightValue
              grams={item.netWeightGrams}
              gramsPerTola={item.gramsPerTola}
            />{' '}
          </dd>
        </div>
        <div>
          <dt>{t('inventory.labels.fineMetalEquivalent')}</dt>
          <dd>
            <WeightValue
              grams={item.fineWeightGrams}
              gramsPerTola={item.gramsPerTola}
            />
          </dd>
        </div>
      </dl>
      {item.notes && <p className="item-notes">{item.notes}</p>}
      <h3 className="history-title">
        <Icon name="history" size={18} />{' '}
        {' ' + t('inventory.itemDetails.stockHistory')}
      </h3>
      {!history && !error && (
        <p className="muted" role="status">
          {t('inventory.itemDetails.loadingHistory')}
        </p>
      )}
      <ol className="history-list">
        {history?.map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>
                {t(
                  (
                    {
                      RECEIPT: 'inventory.itemDetails.pieceReceived',
                      RECEIPT_VOID: 'inventory.itemDetails.receiptVoided',
                      SALE: 'inventory.itemDetails.pieceSold',
                      SALE_CANCEL: 'inventory.itemDetails.saleCancelled',
                    } as const
                  )[entry.kind],
                )}
              </strong>
              <span>
                <WeightValue
                  grams={entry.netWeightGrams}
                  gramsPerTola={item.gramsPerTola}
                />
              </span>
            </div>
            <p>{entry.reason}</p>
            {entry.saleId && (
              <a className="text-button" href={`#/sales/${entry.saleId}`}>
                {t('common.labels.viewSale')}
              </a>
            )}
            <TimeValue value={entry.createdAt} />
          </li>
        ))}
      </ol>
      {item.status === 'AVAILABLE' &&
        (correcting ? (
          <form
            className="correction-form"
            onSubmit={(event) => void voidReceipt(event)}
          >
            <p>{t('inventory.itemDetails.voidReceiptHelp')}</p>
            <label>
              {t('common.labels.reasonForCorrection')}
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCorrecting(false)}
                disabled={busy}
              >
                {t('inventory.itemDetails.keepReceipt')}
              </button>
              <button className="button danger" disabled={busy}>
                {busy
                  ? t('common.actions.saving')
                  : t('inventory.itemDetails.confirmVoidReceipt')}
              </button>
            </div>
          </form>
        ) : (
          <div className="detail-footer">
            <span className="muted">
              {t('inventory.itemDetails.enteredSomethingIncorrectly')}
            </span>
            <Permission name="records.correct">
              <button
                className="text-button danger-text"
                onClick={() => setCorrecting(true)}
              >
                {t('inventory.itemDetails.voidThisReceipt')}
              </button>
            </Permission>
          </div>
        ))}
      {error && (
        <p className="error" role="alert">
          {message(error)}
        </p>
      )}
    </Dialog>
  );
}
