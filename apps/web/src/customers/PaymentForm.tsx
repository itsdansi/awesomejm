import { useState, type FormEvent } from 'react';
import {
  accountMutationSchema,
  accountPaymentSchema,
  nepalToday,
  type AccountPayment,
  type Customer,
} from '@awesomejm/contracts';
import { Dialog, Icon } from '../shared/ui';
import { request, errorMessage } from '../shared/api';
import { balance } from './format';

export function PaymentForm({
  customer,
  kind,
  onClose,
  onSaved,
}: {
  customer: Customer;
  kind: AccountPayment['kind'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [requestId] = useState(() => globalThis.crypto.randomUUID());
  const [date, setDate] = useState(() => nepalToday());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<AccountPayment['method']>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = balance(customer.balanceNpr);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = accountPaymentSchema.safeParse({
      requestId,
      kind,
      entryDate: date,
      amountNpr: amount,
      method,
      reference,
      notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request(
        `/customers/${customer.id}/payments`,
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
  return (
    <Dialog
      title={
        kind === 'PAYMENT' ? 'Record a payment' : 'Record an advance refund'
      }
      eyebrow="Customer accounts"
      busy={busy}
      onClose={onClose}
    >
      <p className="dialog-description">
        {kind === 'PAYMENT'
          ? 'Record money received from'
          : 'Record an advance already returned to'}{' '}
        <strong>{customer.name}</strong>.{' '}
        {kind === 'PAYMENT'
          ? 'Any amount beyond the dues becomes an advance held for this customer.'
          : 'The refund is limited to the advance currently held.'}
      </p>
      <div className={`account-form-balance ${current.className}`}>
        <span>{current.label}</span>
        <strong>NPR {current.amount}</strong>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="form-grid" disabled={busy}>
          <label>
            Amount (NPR)
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            Entry date (AD)
            <input
              required
              type="date"
              min={customer.latestEntryDate}
              max={nepalToday()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <span className="field-hint">
              On or after {customer.latestEntryDate}.
            </span>
          </label>
          <label>
            Payment method
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as AccountPayment['method'])
              }
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="DIGITAL_WALLET">Digital wallet</option>
            </select>
          </label>
          <label>
            Reference (optional)
            <input
              maxLength={160}
              placeholder="Bank / wallet / paper reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <label className="full-width">
            Notes (optional)
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
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
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? 'Saving…'
              : kind === 'PAYMENT'
                ? 'Save payment'
                : 'Save refund'}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
