import { t, message, useLanguage } from '../i18n/language';
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
  useLanguage();

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
      setError(parsed.error.issues.map((issue) => issue.message).join('\n'));
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
        kind === 'PAYMENT'
          ? t('Record a payment')
          : t('Record an advance refund')
      }
      eyebrow={t('Customer accounts')}
      busy={busy}
      onClose={onClose}
    >
      <p className="dialog-description">
        {kind === 'PAYMENT'
          ? t('Record money received from')
          : t('Record an advance already returned to')}{' '}
        <strong>{customer.name}</strong>.{' '}
        {kind === 'PAYMENT'
          ? t(
              'Any amount beyond the dues becomes an advance held for this customer.',
            )
          : t('The refund is limited to the advance currently held.')}
      </p>
      <div className={`account-form-balance ${current.className}`}>
        <span>{t(current.label)}</span>
        <strong>
          {t('NPR ')}
          {current.amount}
        </strong>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="form-grid" disabled={busy}>
          <label>
            {t('Amount (NPR)')}
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            {t('Entry date (AD)')}
            <input
              required
              type="date"
              min={customer.latestEntryDate}
              max={nepalToday()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <span className="field-hint">
              {t('On or after ')}
              {customer.latestEntryDate}.
            </span>
          </label>
          <label>
            {t('Payment method')}
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as AccountPayment['method'])
              }
            >
              <option value="CASH">{t('Cash')}</option>
              <option value="BANK">{t('Bank')}</option>
              <option value="DIGITAL_WALLET">{t('Digital wallet')}</option>
            </select>
          </label>
          <label>
            {t('Reference (optional)')}
            <input
              maxLength={160}
              placeholder={t('Bank / wallet / paper reference')}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <label className="full-width">
            {t('Notes (optional)')}
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
            {message(error)}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('Cancel')}
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? t('Saving…')
              : kind === 'PAYMENT'
                ? t('Save payment')
                : t('Save refund')}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
