import { useAuth } from '../auth/AuthContext';
import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
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
  useLanguage();
  const { user } = useAuth();

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
      setError(parsed.error.issues.map((issue) => issue.message).join('\n'));
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
  const printable =
    entry.kind === 'PAYMENT' ||
    entry.kind === 'ADVANCE_REFUND' ||
    entry.kind === 'PURCHASE_PAYOUT';
  return (
    <Dialog
      title={entry.entryCode}
      eyebrow={t('Customer account entry')}
      busy={busy}
      onClose={onClose}
    >
      <div className="receipt-print">
        <div className="receipt-brand">
          <span>
            {t('AWESOMEJM / {shopName}', { shopName: user.shopName })}
          </span>
          <strong>
            {printable ? t('Account acknowledgement') : t('Account entry')}
          </strong>
          <small>
            {entry.entryCode} · {entry.entryDate} {t(' AD')}
          </small>
        </div>
        {entry.reversed && (
          <p className="receipt-reversed">
            {t('REVERSED · This entry has a recorded correction.')}
          </p>
        )}
        <p className="receipt-kind">{t(entryTitle[entry.kind])}</p>
        <p className="receipt-amount">
          <small>{t('NPR ')}</small>
          {money(entry.amountNpr.replace(/^-/, ''))}
        </p>
        <dl className="details-grid">
          <div>
            <dt>{t('Customer at posting')}</dt>
            <dd>
              {entry.customerSnapshot.name}
              <small>{entry.customerSnapshot.customerCode}</small>
            </dd>
          </div>
          <div>
            <dt>{t('Phone')}</dt>
            <dd>{entry.customerSnapshot.phone || '—'}</dd>
          </div>
          <div>
            <dt>{t('Address')}</dt>
            <dd>{entry.customerSnapshot.address || '—'}</dd>
          </div>
          <div>
            <dt>{t('PAN')}</dt>
            <dd>{entry.customerSnapshot.pan || '—'}</dd>
          </div>
          <div>
            <dt>{t('Method')}</dt>
            <dd>{entry.method ? t(methodTitle[entry.method]) : '—'}</dd>
          </div>
          <div>
            <dt>{t('Reference')}</dt>
            <dd>{entry.reference || '—'}</dd>
          </div>
        </dl>
        {entry.notes && <p className="item-notes">{entry.notes}</p>}
        <p className="receipt-disclaimer">
          {t(
            'Internal customer account record · NPR · This acknowledgement is not a sales invoice.',
          )}
        </p>
      </div>
      {printable && (
        <button
          type="button"
          className="button secondary"
          onClick={() => globalThis.print()}
        >
          {t('Print acknowledgement')}
        </button>
      )}
      {entry.saleId && (
        <p className="account-scope-note">
          {t('This entry is linked to a sale.')}{' '}
          <a className="text-button" href={`#/sales/${entry.saleId}`}>
            {t('View sale →')}
          </a>
        </p>
      )}
      {entry.orderId && (
        <p className="account-scope-note">
          {t('Payment tagged to an order.')}{' '}
          <a className="text-button" href={`#/orders/${entry.orderId}`}>
            {t('View order →')}
          </a>
        </p>
      )}
      {entry.purchaseId && (
        <p className="account-scope-note">
          {t('Linked purchase or exchange.')}{' '}
          <a className="text-button" href={`#/purchases/${entry.purchaseId}`}>
            {t('View settlement →')}
          </a>
        </p>
      )}
      {!entry.purchaseId &&
        !entry.saleId &&
        !entry.reversed &&
        entry.kind !== 'REVERSAL' &&
        (correcting ? (
          <form
            className="correction-form"
            onSubmit={(event) => void reverse(event)}
          >
            <p>
              {t(
                'This adds an equal and opposite entry. Use a reversal to correct a recording mistake; record money returned as an advance refund.',
              )}
            </p>
            <label>
              {t('Reversal date (AD)')}
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
              {t('Reason for reversal')}
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
                {t('Keep entry')}
              </button>
              <button className="button danger" disabled={busy}>
                {busy ? t('Saving…') : t('Confirm reversal')}
              </button>
            </div>
          </form>
        ) : (
          <div className="detail-footer">
            <span className="muted">{t('Recorded incorrectly?')}</span>
            <Permission name="records.correct">
              <button
                className="text-button danger-text"
                onClick={() => setCorrecting(true)}
              >
                {t('Reverse this entry')}
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
