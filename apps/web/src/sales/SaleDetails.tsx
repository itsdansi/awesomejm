import { useAuth } from '../auth/AuthContext';
import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
import { useState, type FormEvent } from 'react';
import {
  cancelSaleSchema,
  nepalToday,
  saleDetailSchema,
  type SaleRecord,
} from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { Dialog } from '../shared/ui';
import { request, errorMessage } from '../shared/api';
import { useResource } from '../shared/useResource';
import { methodTitle } from '../customers/format';
import { SaleFigures } from './SaleFigures';

export function SaleDetails({ saleId }: { saleId: string }) {
  useLanguage();
  const { user } = useAuth();

  const [revision, setRevision] = useState(0);
  const [correcting, setCorrecting] = useState(false);
  const result = useResource(
    `/sales/${encodeURIComponent(saleId)}`,
    saleDetailSchema,
    revision,
  );
  const detail = result.data;
  return (
    <AppShell section="Sales">
      <a className="back-link" href="#/sales">
        {t('← Sales register')}
      </a>
      {result.loading ? (
        <div className="empty-state" role="status">
          {t('Loading sale…')}
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>{t('Sale couldn’t load')}</h2>
          <p className="error" role="alert">
            {message(result.error)}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t('Try again')}
          </button>
        </div>
      ) : (
        detail && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {t('RECORDED SALE · ')}
                  {detail.sale.saleDate} {t(' AD')}
                </p>
                <h1>
                  {detail.sale.saleCode}
                  <span>.</span>
                </h1>
                <p className="description">
                  {t('The pieces and prices saved when this sale was posted.')}
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => globalThis.print()}
              >
                {t('Print internal record')}
              </button>
            </div>
            <section className="stock-panel print-document">
              <div className="stock-heading">
                <div>
                  <p className="eyebrow">
                    {t('AWESOMEJM / {shopName} · INTERNAL SALE RECORD', {
                      shopName: user.shopName,
                    })}
                  </p>
                  <h2>
                    {detail.sale.saleCode}{' '}
                    <span
                      className={`status ${detail.sale.status === 'CANCELLED' ? 'voided' : ''}`}
                    >
                      {detail.sale.status === 'CANCELLED'
                        ? t('Cancelled')
                        : t('Posted')}
                    </span>
                  </h2>
                  <p>
                    {detail.sale.saleDate} {t(' AD · ')}
                    {detail.lines.length} {t(' pieces · NPR')}
                  </p>
                </div>
              </div>
              {detail.sale.status === 'CANCELLED' && (
                <p className="receipt-reversed sale-cancelled">
                  {t('CANCELLED · ')}
                  {detail.sale.cancellationDate} {t(' AD ·')}{' '}
                  {detail.sale.cancellationReason}
                  <br />
                  {t(
                    'The linked stock and account entries were reversed. Amounts below show the original posting.',
                  )}
                </p>
              )}
              <dl className="details-grid sale-customer-details">
                <div>
                  <dt>{t('Customer at posting')}</dt>
                  <dd>
                    {detail.sale.customerSnapshot.name}
                    <small>{detail.sale.customerSnapshot.customerCode}</small>
                  </dd>
                </div>
                <div>
                  <dt>{t('Phone / PAN')}</dt>
                  <dd>
                    {detail.sale.customerSnapshot.phone || '—'}
                    <small>
                      {t('PAN: ')}
                      {detail.sale.customerSnapshot.pan || '—'}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>{t('Address')}</dt>
                  <dd>{detail.sale.customerSnapshot.address || '—'}</dd>
                </div>
                <div>
                  <dt>{t('Official bill reference')}</dt>
                  <dd>{detail.sale.billReference || t('Not entered')}</dd>
                </div>
                <div>
                  <dt>{t('Payment method')}</dt>
                  <dd>
                    {detail.sale.paymentMethod
                      ? t(methodTitle[detail.sale.paymentMethod])
                      : t('No money received')}
                  </dd>
                </div>
                <div>
                  <dt>{t('Payment reference')}</dt>
                  <dd>{detail.sale.paymentReference || '—'}</dd>
                </div>
              </dl>
              {detail.sale.orderId && (
                <p className="sale-review-reference">
                  {t('Linked custom order:')}{' '}
                  <a
                    className="text-button"
                    href={`#/orders/${detail.sale.orderId}`}
                  >
                    {t('View order →')}
                  </a>
                </p>
              )}
              {detail.sale.purchaseId && (
                <p className="sale-review-reference">
                  {t('Linked exchange:')}{' '}
                  <a
                    className="text-button"
                    href={`#/purchases/${detail.sale.purchaseId}`}
                  >
                    {t('View complete settlement / correction →')}
                  </a>
                  {t('. This sale snapshot precedes any purchase payout.')}
                </p>
              )}
              <SaleFigures lines={detail.lines} totals={detail.sale} />
              {detail.sale.notes && (
                <p className="sale-review-reference">{detail.sale.notes}</p>
              )}
              <p className="receipt-disclaimer sale-disclaimer">
                {t(
                  'Internal sale record · This is not a tax invoice. Balances and dues shown are snapshots at posting; later payments appear in the customer account.',
                )}
              </p>
            </section>
            <div className="sale-page-actions">
              <a
                className="button secondary"
                href={`#/customers/${detail.sale.customerId}`}
              >
                {t('View customer account →')}
              </a>
              {detail.sale.status === 'POSTED' && !detail.sale.purchaseId && (
                <Permission name="records.correct">
                  <button
                    className="text-button danger-text"
                    onClick={() => setCorrecting(true)}
                  >
                    {t('Correct an erroneous sale')}
                  </button>
                </Permission>
              )}
            </div>
            {correcting && (
              <CancelSale
                sale={detail.sale}
                onClose={() => setCorrecting(false)}
                onSaved={() => {
                  setCorrecting(false);
                  setRevision((value) => value + 1);
                }}
              />
            )}
          </>
        )
      )}
    </AppShell>
  );
}
function CancelSale({
  sale,
  onClose,
  onSaved,
}: {
  sale: SaleRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLanguage();

  const [requestId] = useState(() => globalThis.crypto.randomUUID());
  const [date, setDate] = useState(() => nepalToday()),
    [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function cancel(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed = cancelSaleSchema.safeParse({
      requestId,
      cancellationDate: date,
      reason,
      confirmStockInShop: confirmed,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('\n'));
      return;
    }
    setBusy(true);
    try {
      await request(`/sales/${sale.id}/cancel`, saleDetailSchema, {
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
      title={t('Correct {value0}', { value0: sale.saleCode })}
      eyebrow={t('SALE RECORD CORRECTION')}
      busy={busy}
      onClose={onClose}
    >
      <form
        className="correction-form"
        onSubmit={(event) => void cancel(event)}
      >
        <p>
          {t(
            'Use this only for an erroneous entry while all pieces are still in the shop. This restores the pieces and reverses the recorded charge and received payment together. The original record remains visible.',
          )}
        </p>
        <p>
          {sale.orderId && t('The linked order returns to Ready. ')}
          {t(
            'This records a correction. For a customer return after delivery or money actually refunded, a separate return or refund record is needed.',
          )}
        </p>
        <label>
          {t('Correction date (AD)')}
          <input
            type="date"
            required
            min={sale.saleDate}
            max={nepalToday()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          {t('Reason for correction')}
          <textarea
            required
            minLength={5}
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className="sale-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            required
            disabled={busy}
          />
          {t('All pieces from this sale are physically in the shop.')}
        </label>
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
            {t('Keep sale')}
          </button>
          <button className="button danger" disabled={busy || !confirmed}>
            {busy ? t('Recording correction…') : t('Cancel erroneous sale')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
