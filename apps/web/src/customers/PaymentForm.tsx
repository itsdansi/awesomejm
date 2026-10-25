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
          ? t('customers.paymentForm.recordAPayment')
          : t('customers.paymentForm.recordAnAdvanceRefund')
      }
      busy={busy}
      onClose={onClose}
    >
      <p className="dialog-description">
        {kind === 'PAYMENT'
          ? t('customers.paymentForm.recordMoneyReceivedFrom')
          : t('customers.paymentForm.recordAnAdvanceAlreadyReturnedTo')}{' '}
        <strong>{customer.name}</strong>.{' '}
        {kind === 'PAYMENT'
          ? t('customers.paymentForm.anyAmountBeyondTheDuesBecomesAnAdvance')
          : t('customers.paymentForm.theRefundIsLimitedToTheAdvanceCurrently')}
      </p>
      <div className={`account-form-balance ${current.className}`}>
        <span>{t(current.label)}</span>
        <strong>
          {t('common.money.currency') + ' '}
          {current.amount}
        </strong>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="form-grid" disabled={busy}>
          <label>
            {t('common.fields.amount')}
            <input
              required
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            {t('customers.paymentForm.entryDateAd')}
            <input
              required
              type="date"
              min={customer.latestEntryDate}
              max={nepalToday()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <span className="field-hint">
              {t('customers.paymentForm.onOrAfter') + ' '}
              {customer.latestEntryDate}.
            </span>
          </label>
          <label>
            {t('common.labels.paymentMethod')}
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as AccountPayment['method'])
              }
            >
              <option value="CASH">{t('common.labels.cash')}</option>
              <option value="BANK">{t('common.labels.bank')}</option>
              <option value="DIGITAL_WALLET">
                {t('common.labels.digitalWallet')}
              </option>
            </select>
          </label>
          <label>
            {t('customers.paymentForm.referenceOptional')}
            <input
              maxLength={160}
              placeholder={t('customers.paymentForm.bankWalletPaperReference')}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <label className="full-width">
            {t('common.labels.notesOptional')}
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
            {t('common.actions.cancel')}
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? t('common.actions.saving')
              : kind === 'PAYMENT'
                ? t('customers.paymentForm.savePayment')
                : t('customers.paymentForm.saveRefund')}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
