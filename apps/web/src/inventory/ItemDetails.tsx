import { Permission } from '../auth/Permission';
import { useEffect, useState, type FormEvent } from 'react';
import { gramsToTola } from '@awesomejm/calculations';
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
          {item.metal === 'GOLD' ? 'Gold' : 'Silver'}
        </span>
        <span className="muted">
          {item.status === 'AVAILABLE'
            ? 'Available'
            : item.status === 'SOLD'
              ? 'Sold'
              : 'Voided receipt'}
        </span>
      </div>
      <dl className="details-grid">
        <div>
          <dt>Category</dt>
          <dd>{item.category}</dd>
        </div>
        <div>
          <dt>Purity</dt>
          <dd>{item.fineness}‰</dd>
        </div>
        <div>
          <dt>Gross weight</dt>
          <dd>{item.grossWeightGrams} g</dd>
        </div>
        <div>
          <dt>Stone / other weight</dt>
          <dd>{item.nonMetalWeightGrams} g</dd>
        </div>
        <div>
          <dt>Net metal weight</dt>
          <dd>
            {item.netWeightGrams} g{' '}
            <small>
              ({gramsToTola(item.netWeightGrams, item.gramsPerTola)} tola)
            </small>
          </dd>
        </div>
        <div>
          <dt>Fine-metal equivalent</dt>
          <dd>{item.fineWeightGrams} g</dd>
        </div>
      </dl>
      {item.notes && <p className="item-notes">{item.notes}</p>}
      <h3 className="history-title">
        <Icon name="history" size={18} /> Stock history
      </h3>
      {!history && !error && (
        <p className="muted" role="status">
          Loading history…
        </p>
      )}
      <ol className="history-list">
        {history?.map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>
                {
                  {
                    RECEIPT: 'Piece received',
                    RECEIPT_VOID: 'Receipt voided',
                    SALE: 'Piece sold',
                    SALE_CANCEL: 'Sale cancelled',
                  }[entry.kind]
                }
              </strong>
              <span>{entry.netWeightGrams} g</span>
            </div>
            <p>{entry.reason}</p>
            {entry.saleId && (
              <a className="text-button" href={`#/sales/${entry.saleId}`}>
                View sale →
              </a>
            )}
            <time dateTime={entry.createdAt}>
              {new Date(entry.createdAt).toLocaleString('en-NP', {
                timeZone: 'Asia/Kathmandu',
              })}{' '}
              · Nepal time
            </time>
          </li>
        ))}
      </ol>
      {item.status === 'AVAILABLE' &&
        (correcting ? (
          <form
            className="correction-form"
            onSubmit={(event) => void voidReceipt(event)}
          >
            <p>
              Use this only to correct a mistaken receipt. The piece leaves
              available stock and its history is retained.
            </p>
            <label>
              Reason for correction
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
                Keep receipt
              </button>
              <button className="button danger" disabled={busy}>
                {busy ? 'Saving…' : 'Confirm void receipt'}
              </button>
            </div>
          </form>
        ) : (
          <div className="detail-footer">
            <span className="muted">Entered something incorrectly?</span>
            <Permission name="records.correct">
              <button
                className="text-button danger-text"
                onClick={() => setCorrecting(true)}
              >
                Void this receipt
              </button>
            </Permission>
          </div>
        ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
