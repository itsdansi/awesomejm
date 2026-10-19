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
        ← Sales register
      </a>
      {result.loading ? (
        <div className="empty-state" role="status">
          Loading sale…
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>Sale couldn’t load</h2>
          <p className="error" role="alert">
            {result.error}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((value) => value + 1)}
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
                  RECORDED SALE · {detail.sale.saleDate} AD
                </p>
                <h1>
                  {detail.sale.saleCode}
                  <span>.</span>
                </h1>
                <p className="description">
                  The pieces and prices saved when this sale was posted.
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
                    AWESOMEJM / FIRST SHOP · INTERNAL SALE RECORD
                  </p>
                  <h2>
                    {detail.sale.saleCode}{' '}
                    <span
                      className={`status ${detail.sale.status === 'CANCELLED' ? 'voided' : ''}`}
                    >
                      {detail.sale.status === 'CANCELLED'
                        ? 'Cancelled'
                        : 'Posted'}
                    </span>
                  </h2>
                  <p>
                    {detail.sale.saleDate} AD · {detail.lines.length} pieces ·
                    NPR
                  </p>
                </div>
              </div>
              {detail.sale.status === 'CANCELLED' && (
                <p className="receipt-reversed sale-cancelled">
                  CANCELLED · {detail.sale.cancellationDate} AD ·{' '}
                  {detail.sale.cancellationReason}
                  <br />
                  The linked stock and account entries were reversed. Amounts
                  below show the original posting.
                </p>
              )}
              <dl className="details-grid sale-customer-details">
                <div>
                  <dt>Customer at posting</dt>
                  <dd>
                    {detail.sale.customerSnapshot.name}
                    <small>{detail.sale.customerSnapshot.customerCode}</small>
                  </dd>
                </div>
                <div>
                  <dt>Phone / PAN</dt>
                  <dd>
                    {detail.sale.customerSnapshot.phone || '—'}
                    <small>
                      PAN: {detail.sale.customerSnapshot.pan || '—'}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{detail.sale.customerSnapshot.address || '—'}</dd>
                </div>
                <div>
                  <dt>Official bill reference</dt>
                  <dd>{detail.sale.billReference || 'Not entered'}</dd>
                </div>
                <div>
                  <dt>Payment method</dt>
                  <dd>
                    {detail.sale.paymentMethod
                      ? methodTitle[detail.sale.paymentMethod]
                      : 'No money received'}
                  </dd>
                </div>
                <div>
                  <dt>Payment reference</dt>
                  <dd>{detail.sale.paymentReference || '—'}</dd>
                </div>
              </dl>
              <SaleFigures lines={detail.lines} totals={detail.sale} />
              {detail.sale.notes && (
                <p className="sale-review-reference">{detail.sale.notes}</p>
              )}
              <p className="receipt-disclaimer sale-disclaimer">
                Internal sale record · This is not a tax invoice. Balances and
                dues shown are snapshots at posting; later payments appear in
                the customer account.
              </p>
            </section>
            <div className="sale-page-actions">
              <a
                className="button secondary"
                href={`#/customers/${detail.sale.customerId}`}
              >
                View customer account →
              </a>
              {detail.sale.status === 'POSTED' && (
                <button
                  className="text-button danger-text"
                  onClick={() => setCorrecting(true)}
                >
                  Correct an erroneous sale
                </button>
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
      setError(parsed.error.issues.map((issue) => issue.message).join(' '));
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
      title={`Correct ${sale.saleCode}`}
      eyebrow="SALE RECORD CORRECTION"
      busy={busy}
      onClose={onClose}
    >
      <form
        className="correction-form"
        onSubmit={(event) => void cancel(event)}
      >
        <p>
          Use this only for an erroneous entry while all pieces are still in the
          shop. This restores the pieces and reverses the recorded charge and
          received payment together. The original record remains visible.
        </p>
        <p>
          This records a correction. For a customer return after delivery or
          money actually refunded, a separate return or refund record is needed.
        </p>
        <label>
          Correction date (AD)
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
          Reason for correction
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
          All pieces from this sale are physically in the shop.
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
            Keep sale
          </button>
          <button className="button danger" disabled={busy || !confirmed}>
            {busy ? 'Recording correction…' : 'Cancel erroneous sale'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
