import { DateValue } from '../settings/DateValue';
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
    <>
      <a className="back-link" href="#/sales">
        {t('sales.labels.salesRegister')}
      </a>
      {result.loading ? (
        <div className="empty-state" role="status">
          {t('sales.saleDetails.loadingSale')}
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>{t('sales.saleDetails.saleCouldnTLoad')}</h2>
          <p className="error" role="alert">
            {message(result.error)}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t('common.actions.tryAgain')}
          </button>
        </div>
      ) : (
        detail && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {t('sales.saleDetails.recordedSale') + ' '}
                  <DateValue value={detail.sale.saleDate} />
                </p>
                <h1>{detail.sale.saleCode}</h1>
              </div>
              <button
                className="button secondary"
                onClick={() => globalThis.print()}
              >
                {t('common.labels.printInternalRecord')}
              </button>
            </div>
            <section className="stock-panel print-document">
              <div className="stock-heading">
                <div>
                  <p className="eyebrow">
                    {t('sales.saleDetails.awesomejmInternalSaleRecord', {
                      shopName: user.shopName,
                    })}
                  </p>
                  <h2>
                    {detail.sale.saleCode}{' '}
                    <span
                      className={`status ${detail.sale.status === 'CANCELLED' ? 'voided' : ''}`}
                    >
                      {detail.sale.status === 'CANCELLED'
                        ? t('common.status.cancelled')
                        : t('common.labels.posted')}
                    </span>
                  </h2>
                  <p>
                    <DateValue value={detail.sale.saleDate} /> {' · '}
                    {detail.lines.length}{' '}
                    {' ' + t('sales.saleDetails.piecesNpr')}
                  </p>
                </div>
              </div>
              {detail.sale.status === 'CANCELLED' && (
                <p className="receipt-reversed sale-cancelled">
                  {t('common.labels.cancelled') + ' '}
                  <DateValue value={detail.sale.cancellationDate} /> {' · '}{' '}
                  {detail.sale.cancellationReason}
                  <br />
                  {t(
                    'sales.saleDetails.theLinkedStockAndAccountEntriesWereReversed',
                  )}
                </p>
              )}
              <dl className="details-grid sale-customer-details">
                <div>
                  <dt>{t('common.labels.customerAtPosting')}</dt>
                  <dd>
                    {detail.sale.customerSnapshot.name}
                    <small>{detail.sale.customerSnapshot.customerCode}</small>
                  </dd>
                </div>
                <div>
                  <dt>{t('common.labels.phonePan')}</dt>
                  <dd>
                    {detail.sale.customerSnapshot.phone || '—'}
                    <small>
                      {t('common.labels.pan') + ' '}
                      {detail.sale.customerSnapshot.pan || '—'}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>{t('common.fields.address')}</dt>
                  <dd>{detail.sale.customerSnapshot.address || '—'}</dd>
                </div>
                <div>
                  <dt>{t('sales.saleDetails.officialBillReference')}</dt>
                  <dd>
                    {detail.sale.billReference || t('common.labels.notEntered')}
                  </dd>
                </div>
                <div>
                  <dt>{t('common.labels.paymentMethod')}</dt>
                  <dd>
                    {detail.sale.paymentMethod
                      ? t(methodTitle[detail.sale.paymentMethod])
                      : t('sales.saleDetails.noMoneyReceived')}
                  </dd>
                </div>
                <div>
                  <dt>{t('sales.saleDetails.paymentReference')}</dt>
                  <dd>{detail.sale.paymentReference || '—'}</dd>
                </div>
              </dl>
              {detail.sale.orderId && (
                <p className="sale-review-reference">
                  {t('sales.saleDetails.linkedCustomOrder')}{' '}
                  <a
                    className="text-button"
                    href={`#/orders/${detail.sale.orderId}`}
                  >
                    {t('common.labels.viewOrder')}
                  </a>
                </p>
              )}
              {detail.sale.purchaseId && (
                <p className="sale-review-reference">
                  {t('sales.saleDetails.linkedExchange')}{' '}
                  <a
                    className="text-button"
                    href={`#/purchases/${detail.sale.purchaseId}`}
                  >
                    {t('sales.saleDetails.viewCompleteSettlementCorrection')}
                  </a>
                  {t(
                    'sales.saleDetails.thisSaleSnapshotPrecedesAnyPurchasePayout',
                  )}
                </p>
              )}
              <SaleFigures lines={detail.lines} totals={detail.sale} />
              {detail.sale.notes && (
                <p className="sale-review-reference">{detail.sale.notes}</p>
              )}
              <p className="receipt-disclaimer sale-disclaimer">
                {t('sales.saleDetails.internalSaleRecordThisIsNotATax')}
              </p>
            </section>
            <div className="sale-page-actions">
              <a
                className="button secondary"
                href={`#/customers/${detail.sale.customerId}`}
              >
                {t('common.labels.viewCustomerAccount')}
              </a>
              {detail.sale.status === 'POSTED' && !detail.sale.purchaseId && (
                <Permission name="records.correct">
                  <button
                    className="text-button danger-text"
                    onClick={() => setCorrecting(true)}
                  >
                    {t('sales.saleDetails.correctAnErroneousSale')}
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
    </>
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
      title={t('common.labels.correct', { code: sale.saleCode })}
      busy={busy}
      onClose={onClose}
    >
      <form
        className="correction-form"
        onSubmit={(event) => void cancel(event)}
      >
        <p>{t('sales.saleDetails.useThisOnlyForAnErroneousEntryWhile')}</p>
        <p>
          {sale.orderId &&
            t('sales.saleDetails.theLinkedOrderReturnsToReady') + ' '}
          {t('sales.saleDetails.thisRecordsACorrectionForACustomerReturn')}
        </p>
        <label>
          {t('common.labels.correctionDateAd')}
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
          {t('common.labels.reasonForCorrection')}
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
          {t('sales.saleDetails.physicalReturnConfirmation')}
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
            {t('sales.saleDetails.keepSale')}
          </button>
          <button className="button danger" disabled={busy || !confirmed}>
            {busy
              ? t('sales.saleDetails.recordingCorrection')
              : t('sales.saleDetails.cancelErroneousSale')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
