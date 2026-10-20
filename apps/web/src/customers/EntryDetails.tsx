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
      eyebrow={t('common.labels.customerAccountEntry')}
      busy={busy}
      onClose={onClose}
    >
      <div className="receipt-print">
        <div className="receipt-brand">
          <span>
            {t('common.print.shopHeading', { shopName: user.shopName })}
          </span>
          <strong>
            {printable
              ? t('customers.entryDetails.accountAcknowledgement')
              : t('customers.entryDetails.accountEntry')}
          </strong>
          <small>
            {entry.entryCode} · {entry.entryDate} {' ' + t('common.labels.ad')}
          </small>
        </div>
        {entry.reversed && (
          <p className="receipt-reversed">
            {t(
              'customers.entryDetails.reversedThisEntryHasARecordedCorrection',
            )}
          </p>
        )}
        <p className="receipt-kind">{t(entryTitle[entry.kind])}</p>
        <p className="receipt-amount">
          <small>{t('common.money.currency') + ' '}</small>
          {money(entry.amountNpr.replace(/^-/, ''))}
        </p>
        <dl className="details-grid">
          <div>
            <dt>{t('common.labels.customerAtPosting')}</dt>
            <dd>
              {entry.customerSnapshot.name}
              <small>{entry.customerSnapshot.customerCode}</small>
            </dd>
          </div>
          <div>
            <dt>{t('common.fields.phone')}</dt>
            <dd>{entry.customerSnapshot.phone || '—'}</dd>
          </div>
          <div>
            <dt>{t('common.fields.address')}</dt>
            <dd>{entry.customerSnapshot.address || '—'}</dd>
          </div>
          <div>
            <dt>{t('common.fields.pan')}</dt>
            <dd>{entry.customerSnapshot.pan || '—'}</dd>
          </div>
          <div>
            <dt>{t('common.labels.method')}</dt>
            <dd>{entry.method ? t(methodTitle[entry.method]) : '—'}</dd>
          </div>
          <div>
            <dt>{t('customers.entryDetails.reference')}</dt>
            <dd>{entry.reference || '—'}</dd>
          </div>
        </dl>
        {entry.notes && <p className="item-notes">{entry.notes}</p>}
        <p className="receipt-disclaimer">
          {t('customers.entryDetails.printDisclaimer')}
        </p>
      </div>
      {printable && (
        <button
          type="button"
          className="button secondary"
          onClick={() => globalThis.print()}
        >
          {t('customers.entryDetails.printAcknowledgement')}
        </button>
      )}
      {entry.saleId && (
        <p className="account-scope-note">
          {t('customers.entryDetails.thisEntryIsLinkedToASale')}{' '}
          <a className="text-button" href={`#/sales/${entry.saleId}`}>
            {t('common.labels.viewSale')}
          </a>
        </p>
      )}
      {entry.orderId && (
        <p className="account-scope-note">
          {t('customers.entryDetails.paymentTaggedToAnOrder')}{' '}
          <a className="text-button" href={`#/orders/${entry.orderId}`}>
            {t('common.labels.viewOrder')}
          </a>
        </p>
      )}
      {entry.purchaseId && (
        <p className="account-scope-note">
          {t('customers.entryDetails.linkedPurchaseOrExchange')}{' '}
          <a className="text-button" href={`#/purchases/${entry.purchaseId}`}>
            {t('customers.entryDetails.viewSettlement')}
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
              {t('customers.entryDetails.thisAddsAnEqualAndOppositeEntryUse')}
            </p>
            <label>
              {t('customers.entryDetails.reversalDateAd')}
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
              {t('customers.entryDetails.reasonForReversal')}
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
                {t('customers.entryDetails.keepEntry')}
              </button>
              <button className="button danger" disabled={busy}>
                {busy
                  ? t('common.actions.saving')
                  : t('customers.entryDetails.confirmReversal')}
              </button>
            </div>
          </form>
        ) : (
          <div className="detail-footer">
            <span className="muted">
              {t('customers.entryDetails.recordedIncorrectly')}
            </span>
            <Permission name="records.correct">
              <button
                className="text-button danger-text"
                onClick={() => setCorrecting(true)}
              >
                {t('customers.entryDetails.reverseThisEntry')}
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
