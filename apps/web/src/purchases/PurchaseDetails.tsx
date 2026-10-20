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
        ← Purchase register
      </a>
      {result.loading ? (
        <div className="empty-state" role="status">
          Loading purchase…
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>Purchase couldn’t load</h2>
          <p className="error" role="alert">
            {result.error}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            Try again
          </button>
        </div>
      ) : (
        detail && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {detail.sale ? 'EXCHANGE' : 'OLD-METAL PURCHASE'} ·{' '}
                  {detail.purchase.purchaseDate} AD
                </p>
                <h1>
                  {detail.purchase.purchaseCode}
                  <span>.</span>
                </h1>
                <p className="description">
                  Incoming lots, original valuation and the complete recorded
                  settlement.
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => globalThis.print()}
              >
                Print internal record
              </button>
            </div>
            <section className="stock-panel print-document">
              <div className="stock-heading">
                <div>
                  <p className="eyebrow">
                    AWESOMEJM / FIRST SHOP · PURCHASE RECORD
                  </p>
                  <h2>
                    {detail.purchase.purchaseCode}{' '}
                    <span
                      className={`status ${detail.purchase.status === 'CANCELLED' ? 'voided' : ''}`}
                    >
                      {detail.purchase.status === 'CANCELLED'
                        ? 'Cancelled'
                        : detail.sale
                          ? 'Exchange posted'
                          : 'Posted'}
                    </span>
                  </h2>
                  <p>{detail.purchase.purchaseDate} AD · NPR</p>
                </div>
              </div>
              {detail.purchase.status === 'CANCELLED' && (
                <p className="receipt-reversed sale-cancelled">
                  CANCELLED · {detail.purchase.cancellationDate} AD ·{' '}
                  {detail.purchase.cancellationReason}
                  <br />
                  Amounts and weights below show the original posting. The
                  linked records were reversed together.
                </p>
              )}
              <dl className="details-grid sale-customer-details">
                <div>
                  <dt>Customer at posting</dt>
                  <dd>
                    {detail.purchase.customerSnapshot.name}
                    <small>
                      {detail.purchase.customerSnapshot.customerCode}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Phone / PAN</dt>
                  <dd>
                    {detail.purchase.customerSnapshot.phone || '—'}
                    <small>
                      PAN: {detail.purchase.customerSnapshot.pan || '—'}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{detail.purchase.customerSnapshot.address || '—'}</dd>
                </div>
                <div>
                  <dt>Purchase reference</dt>
                  <dd>{detail.purchase.reference || '—'}</dd>
                </div>
                <div>
                  <dt>Payout method</dt>
                  <dd>
                    {detail.purchase.payoutMethod
                      ? methodTitle[detail.purchase.payoutMethod]
                      : 'No payout'}
                  </dd>
                </div>
                <div>
                  <dt>Payout reference</dt>
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
                Incoming lots:{' '}
                {detail.lines.map((line) => line.lotCode).join(', ')}
              </p>
              {detail.purchase.notes && (
                <p className="sale-review-reference">{detail.purchase.notes}</p>
              )}
              <p className="sale-disclaimer receipt-disclaimer">
                Internal record, not an official invoice. Balances are snapshots
                at posting. This tracks metal purchased outright; customer-owned
                metal custody and refining are separate workflows.
              </p>
            </section>
            <div className="sale-page-actions">
              <div className="order-heading-actions">
                <a
                  className="button secondary"
                  href={`#/customers/${detail.purchase.customerId}`}
                >
                  View customer account →
                </a>
                {detail.sale && (
                  <a
                    className="button secondary"
                    href={`#/sales/${detail.sale.sale.id}`}
                  >
                    View exchange sale →
                  </a>
                )}
              </div>
              {detail.purchase.status === 'POSTED' && (
                <button
                  className="text-button danger-text"
                  onClick={() => setCorrecting(true)}
                >
                  Correct erroneous settlement
                </button>
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
      setError(input.error.issues.map((i) => i.message).join(' '));
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
      title={`Correct ${detail.purchase.purchaseCode}`}
      eyebrow="SETTLEMENT CORRECTION"
      busy={busy}
      onClose={onClose}
    >
      <form className="correction-form" onSubmit={(event) => void save(event)}>
        <p>
          Use this to correct a recording mistake while the complete incoming
          metal and any outgoing jewellery are physically in the shop. It
          reverses the purchase, exchange sale and recorded money movements
          together. It does not transfer money or process a delivered-item
          return.
        </p>
        <label>
          Correction date (AD)
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
          Reason
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
          All incoming lots and any outgoing pieces are physically in the shop.
        </label>
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
            Keep settlement
          </button>
          <button className="button danger" disabled={busy || !confirmed}>
            {busy ? 'Correcting…' : 'Cancel erroneous settlement'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
