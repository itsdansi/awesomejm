import { useAuth } from '../auth/AuthContext';
import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
import { useState, type FormEvent } from 'react';
import {
  cancelPurchaseSchema,
  nepalToday,
  purchaseDetailSchema,
  type PurchaseDetail,
} from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { Dialog } from '../shared/ui';
import { useResource } from '../shared/useResource';
import { errorMessage, request } from '../shared/api';
import { methodTitle } from '../customers/format';
import { PurchaseFigures } from './PurchaseFigures';
export function PurchaseDetails({ purchaseId }: { purchaseId: string }) {
  useLanguage();
  const { user } = useAuth();

  const [revision, setRevision] = useState(0),
    [correcting, setCorrecting] = useState(false),
    result = useResource(
      `/purchases/${encodeURIComponent(purchaseId)}`,
      purchaseDetailSchema,
      revision,
    ),
    detail = result.data;
  return (
    <AppShell section="Purchases">
      <a className="back-link" href="#/purchases">
        {t('purchases.labels.purchaseRegister')}
      </a>
      {result.loading ? (
        <div className="empty-state" role="status">
          {t('purchases.purchaseDetails.loadingPurchase')}
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>{t('purchases.purchaseDetails.purchaseCouldnTLoad')}</h2>
          <p className="error" role="alert">
            {message(result.error)}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((v) => v + 1)}
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
                  {detail.sale
                    ? t('purchases.purchaseDetails.exchange')
                    : t('purchases.purchaseDetails.oldMetalPurchase')}{' '}
                  · {detail.purchase.purchaseDate} {' ' + t('common.labels.ad')}
                </p>
                <h1>
                  {detail.purchase.purchaseCode}
                  <span>.</span>
                </h1>
                <p className="description">
                  {t('purchases.purchaseDetails.description')}
                </p>
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
                    {t('purchases.purchaseDetails.awesomejmPurchaseRecord', {
                      shopName: user.shopName,
                    })}
                  </p>
                  <h2>
                    {detail.purchase.purchaseCode}{' '}
                    <span
                      className={`status ${detail.purchase.status === 'CANCELLED' ? 'voided' : ''}`}
                    >
                      {detail.purchase.status === 'CANCELLED'
                        ? t('common.status.cancelled')
                        : detail.sale
                          ? t('purchases.purchaseDetails.exchangePosted')
                          : t('common.labels.posted')}
                    </span>
                  </h2>
                  <p>
                    {detail.purchase.purchaseDate}{' '}
                    {' ' + t('purchases.purchaseDetails.adNpr')}
                  </p>
                </div>
              </div>
              {detail.purchase.status === 'CANCELLED' && (
                <p className="receipt-reversed sale-cancelled">
                  {t('common.labels.cancelled') + ' '}
                  {detail.purchase.cancellationDate}{' '}
                  {' ' + t('common.dates.adSeparator')}{' '}
                  {detail.purchase.cancellationReason}
                  <br />
                  {t(
                    'purchases.purchaseDetails.amountsAndWeightsBelowShowTheOriginalPosting',
                  )}
                </p>
              )}
              <dl className="details-grid sale-customer-details">
                <div>
                  <dt>{t('common.labels.customerAtPosting')}</dt>
                  <dd>
                    {detail.purchase.customerSnapshot.name}
                    <small>
                      {detail.purchase.customerSnapshot.customerCode}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>{t('common.labels.phonePan')}</dt>
                  <dd>
                    {detail.purchase.customerSnapshot.phone || '—'}
                    <small>
                      {t('common.labels.pan') + ' '}
                      {detail.purchase.customerSnapshot.pan || '—'}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>{t('common.fields.address')}</dt>
                  <dd>{detail.purchase.customerSnapshot.address || '—'}</dd>
                </div>
                <div>
                  <dt>{t('purchases.purchaseDetails.purchaseReference')}</dt>
                  <dd>{detail.purchase.reference || '—'}</dd>
                </div>
                <div>
                  <dt>{t('purchases.purchaseDetails.payoutMethod')}</dt>
                  <dd>
                    {detail.purchase.payoutMethod
                      ? t(methodTitle[detail.purchase.payoutMethod])
                      : t('purchases.purchaseDetails.noPayout')}
                  </dd>
                </div>
                <div>
                  <dt>{t('purchases.purchaseDetails.payoutReference')}</dt>
                  <dd>{detail.purchase.payoutReference || '—'}</dd>
                </div>
              </dl>
              <PurchaseFigures
                lines={detail.lines}
                totalNpr={detail.purchase.totalNpr}
                saleLines={detail.sale?.lines ?? []}
                saleTotalNpr={detail.sale?.sale.totalNpr ?? '0'}
                receivedNpr={detail.sale?.sale.paymentNpr ?? '0'}
                payoutNpr={detail.purchase.payoutNpr}
                balanceBeforeNpr={detail.purchase.balanceBeforeNpr}
                balanceAfterNpr={detail.purchase.balanceAfterNpr}
              />
              <p className="sale-review-reference">
                {t('purchases.purchaseDetails.incomingLots')}{' '}
                {detail.lines.map((line) => line.lotCode).join(', ')}
              </p>
              {detail.purchase.notes && (
                <p className="sale-review-reference">{detail.purchase.notes}</p>
              )}
              <p className="sale-disclaimer receipt-disclaimer">
                {t(
                  'purchases.purchaseDetails.internalRecordNotAnOfficialInvoiceBalancesAre',
                )}
              </p>
            </section>
            <div className="sale-page-actions">
              <div className="order-heading-actions">
                <a
                  className="button secondary"
                  href={`#/customers/${detail.purchase.customerId}`}
                >
                  {t('common.labels.viewCustomerAccount')}
                </a>
                {detail.sale && (
                  <a
                    className="button secondary"
                    href={`#/sales/${detail.sale.sale.id}`}
                  >
                    {t('purchases.purchaseDetails.viewExchangeSale')}
                  </a>
                )}
              </div>
              {detail.purchase.status === 'POSTED' && (
                <Permission name="records.correct">
                  <button
                    className="text-button danger-text"
                    onClick={() => setCorrecting(true)}
                  >
                    {t('purchases.purchaseDetails.correctErroneousSettlement')}
                  </button>
                </Permission>
              )}
            </div>
            {correcting && (
              <PurchaseCorrection
                detail={detail}
                onClose={() => setCorrecting(false)}
                onSaved={() => {
                  setCorrecting(false);
                  setRevision((v) => v + 1);
                }}
              />
            )}
          </>
        )
      )}
    </AppShell>
  );
}
function PurchaseCorrection({
  detail,
  onClose,
  onSaved,
}: {
  detail: PurchaseDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLanguage();

  const [requestId] = useState(() => globalThis.crypto.randomUUID()),
    [date, setDate] = useState(() => nepalToday()),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    const input = cancelPurchaseSchema.safeParse({
      requestId,
      cancellationDate: date,
      reason,
      confirmStockInShop: confirmed,
    });
    if (!input.success) {
      setError(input.error.issues.map((i) => i.message).join('\n'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request(
        `/purchases/${detail.purchase.id}/cancel`,
        purchaseDetailSchema,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input.data),
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
      title={t('common.labels.correct', { code: detail.purchase.purchaseCode })}
      eyebrow={t('purchases.purchaseDetails.settlementCorrection')}
      busy={busy}
      onClose={onClose}
    >
      <form className="correction-form" onSubmit={(event) => void save(event)}>
        <p>
          {t(
            'purchases.purchaseDetails.useThisToCorrectARecordingMistakeWhile',
          )}
        </p>
        <label>
          {t('common.labels.correctionDateAd')}
          <input
            required
            type="date"
            min={detail.purchase.purchaseDate}
            max={nepalToday()}
            value={date}
            disabled={busy}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          {t('common.fields.reason')}
          <textarea
            required
            minLength={5}
            maxLength={500}
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="sale-confirm">
          <input
            required
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          {t('purchases.purchaseBuilder.physicalExchangeConfirmation')}
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
            {t('purchases.purchaseDetails.keepSettlement')}
          </button>
          <button className="button danger" disabled={busy || !confirmed}>
            {busy
              ? t('purchases.purchaseDetails.correcting')
              : t('purchases.purchaseDetails.cancelErroneousSettlement')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
