import { useState, type FormEvent } from 'react';
import {
  accountMutationSchema,
  nepalToday,
  reverseAccountEntrySchema,
  type AccountEntry,
  type Customer,
} from '@awesomejm/contracts';
import { Dialog } from '../shared/ui';
import { request, errorMessage } from '../shared/api';
import { entryTitle, methodTitle, money } from './format';

export function EntryDetails({
  customer,
  entry,
  onClose,
  onSaved,
}: {
  customer: Customer;
  entry: AccountEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [requestId] = useState(() => globalThis.crypto.randomUUID());
  const [date, setDate] = useState(() => nepalToday());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function reverse(event: FormEvent) {
    event.preventDefault();
    const parsed = reverseAccountEntrySchema.safeParse({
      requestId,
      entryDate: date,
      reason,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request(
        `/customers/${customer.id}/entries/${entry.id}/reverse`,
        accountMutationSchema,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      onSaved();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  const printable = entry.kind === 'PAYMENT' || entry.kind === 'ADVANCE_REFUND';
  return (
    <Dialog
      title={entry.entryCode}
      eyebrow="Customer account entry"
      busy={busy}
      onClose={onClose}
    >
      <div className="receipt-print">
        <div className="receipt-brand">
          <span>AWESOMEJM / First shop</span>
          <strong>
            {printable ? 'Account acknowledgement' : 'Account entry'}
          </strong>
          <small>
            {entry.entryCode} · {entry.entryDate} AD
          </small>
        </div>
        {entry.reversed && (
          <p className="receipt-reversed">
            REVERSED · This entry has a recorded correction.
          </p>
        )}
        <p className="receipt-kind">{entryTitle[entry.kind]}</p>
        <p className="receipt-amount">
          <small>NPR </small>
          {money(entry.amountNpr.replace(/^-/, ''))}
        </p>
        <dl className="details-grid">
          <div>
            <dt>Customer at posting</dt>
            <dd>
              {entry.customerSnapshot.name}
              <small>{entry.customerSnapshot.customerCode}</small>
            </dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{entry.customerSnapshot.phone || '—'}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{entry.customerSnapshot.address || '—'}</dd>
          </div>
          <div>
            <dt>PAN</dt>
            <dd>{entry.customerSnapshot.pan || '—'}</dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>{entry.method ? methodTitle[entry.method] : '—'}</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{entry.reference || '—'}</dd>
          </div>
        </dl>
        {entry.notes && <p className="item-notes">{entry.notes}</p>}
        <p className="receipt-disclaimer">
          Internal customer account record · NPR · This acknowledgement is not a
          sales invoice.
        </p>
      </div>
      {printable && (
        <button
          type="button"
          className="button secondary"
          onClick={() => globalThis.print()}
        >
          Print acknowledgement
        </button>
      )}
      {!entry.reversed &&
        entry.kind !== 'REVERSAL' &&
        (correcting ? (
          <form
            className="correction-form"
            onSubmit={(event) => void reverse(event)}
          >
            <p>
              This adds an equal and opposite entry. Use a reversal to correct a
              recording mistake; record money returned as an advance refund.
            </p>
            <label>
              Reversal date (AD)
              <input
                type="date"
                required
                min={customer.latestEntryDate}
                max={nepalToday()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Reason for reversal
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
                disabled={busy}
                onClick={() => setCorrecting(false)}
              >
                Keep entry
              </button>
              <button className="button danger" disabled={busy}>
                {busy ? 'Saving…' : 'Confirm reversal'}
              </button>
            </div>
          </form>
        ) : (
          <div className="detail-footer">
            <span className="muted">Recorded incorrectly?</span>
            <button
              className="text-button danger-text"
              onClick={() => setCorrecting(true)}
            >
              Reverse this entry
            </button>
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
