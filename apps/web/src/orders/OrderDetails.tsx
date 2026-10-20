import { useAuth } from '../auth/AuthContext';
import { Permission } from '../auth/Permission';
import { useState, type FormEvent } from 'react';
import {
  nepalToday,
  orderDetailSchema,
  orderPaymentSchema,
  updateOrderStatusSchema,
  type OrderDetail,
} from '@awesomejm/contracts';
import { gramsToTola } from '@awesomejm/calculations';
import { AppShell } from '../shared/AppShell';
import { Dialog, Icon } from '../shared/ui';
import { useResource } from '../shared/useResource';
import { errorMessage, request } from '../shared/api';
import { balance, methodTitle, money } from '../customers/format';
import { statusClass, statusTitle } from './format';

export function OrderDetails({ orderId }: { orderId: string }) {
  const [revision, setRevision] = useState(0),
    [action, setAction] = useState<'status' | 'payment' | null>(null);
  const result = useResource(
      `/orders/${encodeURIComponent(orderId)}`,
      orderDetailSchema,
      revision,
    ),
    detail = result.data;
  const closed =
    detail?.order.status === 'DELIVERED' ||
    detail?.order.status === 'CANCELLED';
  const currentBalance = detail ? balance(detail.customer.balanceNpr) : null;
  return (
    <AppShell section="Orders">
      <a className="back-link" href="#/orders">
        ← Order book
      </a>
      {result.loading ? (
        <div className="empty-state" role="status">
          Loading order…
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>Order couldn’t load</h2>
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
                  CUSTOM ORDER · {detail.order.orderDate} AD
                </p>
                <h1>
                  {detail.order.orderCode}
                  <span>.</span>
                </h1>
                <p className="description">
                  {detail.order.customerSnapshot.name} ·{' '}
                  {detail.order.pieceCount}{' '}
                  {detail.order.pieceCount === 1 ? 'piece' : 'pieces'} ·
                  Promised {detail.order.dueDate} AD
                </p>
              </div>
              <div className="order-heading-actions">
                <button
                  className="button secondary"
                  onClick={() => globalThis.print()}
                >
                  Print order slip
                </button>
                {!closed && (
                  <Permission name="orders.write">
                    <button
                      className="button primary"
                      onClick={() => setAction('status')}
                    >
                      Update progress
                      <Icon name="arrow" size={17} />
                    </button>
                  </Permission>
                )}
              </div>
            </div>
            <section className="stock-panel print-document">
              <div className="stock-heading">
                <div>
                  <p className="eyebrow">
                    AWESOMEJM / FIRST SHOP · CUSTOM ORDER
                  </p>
                  <h2>
                    {detail.order.orderCode}{' '}
                    <span className={statusClass(detail.order.status)}>
                      {statusTitle[detail.order.status]}
                    </span>
                  </h2>
                  <p>
                    Booked {detail.order.orderDate} AD · Delivery{' '}
                    {detail.order.dueDate} AD{' '}
                    {detail.order.overdue ? '· OVERDUE' : ''}
                  </p>
                </div>
                <span
                  className={`manual-badge ${detail.order.overdue ? 'danger-text' : ''}`}
                >
                  {detail.order.overdue
                    ? 'DELIVERY OVERDUE'
                    : `${detail.order.pieceCount} ${detail.order.pieceCount === 1 ? 'PIECE' : 'PIECES'}`}
                </span>
              </div>
              {detail.order.status !== 'CANCELLED' && (
                <ol className="order-progress" aria-label="Order progress">
                  {(
                    ['BOOKED', 'IN_PROGRESS', 'READY', 'DELIVERED'] as const
                  ).map((status, index, stages) => {
                    const current = stages.indexOf(
                      detail.order.status as (typeof stages)[number],
                    );
                    return (
                      <li
                        key={status}
                        className={index <= current ? 'reached' : ''}
                        aria-current={index === current ? 'step' : undefined}
                      >
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        {statusTitle[status]}
                      </li>
                    );
                  })}
                </ol>
              )}
              {detail.order.status === 'CANCELLED' && (
                <p className="receipt-reversed sale-cancelled">
                  ORDER CANCELLED · Its specifications and payment history are
                  retained. Cancellation does not refund recorded payments.
                </p>
              )}
              <dl className="details-grid sale-customer-details">
                <div>
                  <dt>Customer at booking</dt>
                  <dd>
                    {detail.order.customerSnapshot.name}
                    <small>{detail.order.customerSnapshot.customerCode}</small>
                  </dd>
                </div>
                <div>
                  <dt>Phone / PAN at booking</dt>
                  <dd>
                    {detail.order.customerSnapshot.phone || '—'}
                    <small>
                      PAN: {detail.order.customerSnapshot.pan || '—'}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Address at booking</dt>
                  <dd>{detail.order.customerSnapshot.address || '—'}</dd>
                </div>
              </dl>
              <div className="order-specs">
                <p className="eyebrow">ORDERED DESIGNS</p>
                {detail.order.lines.map((line, index) => (
                  <article className="order-spec" key={index}>
                    <div className="order-spec-title">
                      <span
                        className={`metal-badge ${line.metal.toLowerCase()}`}
                      >
                        {line.metal === 'GOLD' ? 'Gold' : 'Silver'}
                      </span>
                      <h3>{line.name}</h3>
                      <span className="muted">× {line.quantity}</span>
                    </div>
                    <p>{line.design}</p>
                    <dl>
                      <div>
                        <dt>Purity</dt>
                        <dd>{line.fineness}‰</dd>
                      </div>
                      <div>
                        <dt>Size / measurement</dt>
                        <dd>{line.size || 'Not specified'}</dd>
                      </div>
                      <div>
                        <dt>Expected net / piece</dt>
                        <dd>
                          {line.expectedNetWeightGrams} g
                          <small>
                            ≈ {gramsToTola(line.expectedNetWeightGrams)} tola
                          </small>
                        </dd>
                      </div>
                      <div>
                        <dt>Planned wastage / piece</dt>
                        <dd>{line.plannedWastageGrams} g billed</dd>
                      </div>
                      <div>
                        <dt>Planned making / piece</dt>
                        <dd>NPR {money(line.plannedMakingNpr)}</dd>
                      </div>
                      <div>
                        <dt>Planned stones / piece</dt>
                        <dd>NPR {money(line.plannedStonesNpr)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              <div className="order-finances">
                <div>
                  <p className="eyebrow">ESTIMATED ORDER TOTAL</p>
                  <strong>
                    {detail.order.estimatedTotalNpr === null
                      ? 'Not set'
                      : `NPR ${money(detail.order.estimatedTotalNpr)}`}
                  </strong>
                  <small>Guide only. Final pricing is recorded in Sales.</small>
                </div>
                <div>
                  <p className="eyebrow">PAYMENTS TAGGED TO THIS ORDER</p>
                  <strong>NPR {money(detail.order.taggedPaymentsNpr)}</strong>
                  <small>
                    Net of corrections. Credits the customer’s overall account.
                  </small>
                </div>
              </div>
              {detail.order.notes && (
                <p className="sale-review-reference">{detail.order.notes}</p>
              )}
              <p className="receipt-disclaimer sale-disclaimer">
                Internal order slip · Not a tax invoice. Expected weights
                exclude stones. Conversion display: 1 tola = 11.664 g. Rates and
                final weights are agreed at delivery.
              </p>
            </section>
            <div className="order-followup">
              <div>
                <p className="eyebrow">CURRENT CUSTOMER ACCOUNT</p>
                <strong className={currentBalance?.className}>
                  NPR {currentBalance?.amount}
                </strong>
                <p>
                  {currentBalance?.label} · Includes all orders, sales and
                  payments.
                </p>
                <a
                  className="text-button"
                  href={`#/customers/${detail.customer.id}`}
                >
                  View customer account →
                </a>
              </div>
              <div className="order-followup-actions">
                {!closed && (
                  <Permission name="orders.write">
                    <button
                      className="button secondary"
                      onClick={() => setAction('payment')}
                    >
                      Record order advance
                    </button>
                  </Permission>
                )}
                {detail.order.status === 'READY' && (
                  <>
                    <Permission name="sales.write">
                      <a
                        className="button primary"
                        href={`#/sales/new?orderId=${detail.order.id}`}
                      >
                        Deliver through Sales
                        <Icon name="arrow" size={17} />
                      </a>
                    </Permission>
                    <small>
                      Receive all finished pieces in Inventory first. Select the
                      ordered quantity, metal and purity in Sales.
                    </small>
                  </>
                )}
                {detail.order.status === 'READY' && (
                  <Permission name="purchases.write">
                    <a
                      className="button secondary"
                      href={`#/purchases/new?orderId=${detail.order.id}`}
                    >
                      Deliver with old-metal exchange →
                    </a>
                  </Permission>
                )}
                {detail.order.activeSaleId && (
                  <a
                    className="button primary"
                    href={`#/sales/${detail.order.activeSaleId}`}
                  >
                    View delivery sale →
                  </a>
                )}
              </div>
            </div>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>
                    Order payments <span>{detail.payments.length}</span>
                  </h2>
                  <p>
                    Amounts received for this order and any recorded
                    corrections.
                  </p>
                </div>
              </div>
              {detail.payments.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Entry / date (AD)</th>
                        <th>Details</th>
                        <th className="numeric">Account credit (NPR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            <strong>{payment.entryCode}</strong>
                            <code>{payment.entryDate}</code>
                          </td>
                          <td>
                            {payment.kind === 'REVERSAL'
                              ? 'Payment reversed'
                              : payment.method
                                ? methodTitle[payment.method]
                                : 'Payment'}
                            {payment.reversed && (
                              <span className="reversed-badge">Reversed</span>
                            )}
                            <small className="rate-subline">
                              {payment.reference}
                            </small>
                          </td>
                          <td className="numeric">
                            {payment.amountNpr.startsWith('-')
                              ? money(payment.amountNpr.slice(1))
                              : `− ${money(payment.amountNpr)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="order-no-payments">
                  No payments tagged to this order.
                </div>
              )}
            </section>
            <section className="stock-panel order-history">
              <div className="stock-heading">
                <div>
                  <h2>Progress history</h2>
                  <p>
                    Every change is retained. Delivered orders are corrected
                    from their sale.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Refresh
                </button>
              </div>
              <ol className="order-event-list">
                {detail.events.map((event) => (
                  <li key={event.id}>
                    <div>
                      <span className={statusClass(event.status)}>
                        {statusTitle[event.status]}
                      </span>
                      <time>{event.eventDate} AD</time>
                      <small>Revision {event.version}</small>
                    </div>
                    <p>{event.reason}</p>
                    {event.saleId && (
                      <a
                        className="text-button"
                        href={`#/sales/${event.saleId}`}
                      >
                        View linked sale →
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <p className="account-scope-note">
              Booking specifications stay as recorded. For changed
              specifications, cancel and book a replacement order. Money remains
              on the customer account until applied or refunded; tagged payments
              are not reserved to one order.
            </p>
            {action && (
              <OrderAction
                key={action}
                action={action}
                detail={detail}
                onClose={() => setAction(null)}
                onSaved={() => {
                  setAction(null);
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
function OrderAction({
  action,
  detail,
  onClose,
  onSaved,
}: {
  action: 'status' | 'payment';
  detail: OrderDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [requestId] = useState(() => globalThis.crypto.randomUUID()),
    [date, setDate] = useState(() => nepalToday()),
    [reason, setReason] = useState('');
  const [status, setStatus] = useState(
    detail.order.status === 'READY'
      ? 'IN_PROGRESS'
      : detail.order.status === 'IN_PROGRESS'
        ? 'READY'
        : 'IN_PROGRESS',
  );
  const [amount, setAmount] = useState(''),
    [method, setMethod] = useState('CASH'),
    [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const { can } = useAuth();
  const statuses =
    detail.order.status === 'BOOKED'
      ? ['IN_PROGRESS', 'READY', 'CANCELLED']
      : detail.order.status === 'IN_PROGRESS'
        ? ['READY', 'CANCELLED']
        : ['IN_PROGRESS', 'CANCELLED'];
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed =
      action === 'status'
        ? updateOrderStatusSchema.safeParse({
            requestId,
            expectedVersion: detail.order.version,
            eventDate: date,
            status,
            reason,
          })
        : orderPaymentSchema.safeParse({
            requestId,
            entryDate: date,
            amountNpr: amount,
            method,
            reference,
            notes: reason,
          });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setBusy(true);
    try {
      await request(
        `/orders/${detail.order.id}/${action === 'status' ? 'status' : 'payments'}`,
        orderDetailSchema,
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
  const minDate =
    action === 'payment'
      ? [detail.order.latestActivityDate, detail.customer.latestEntryDate]
          .sort()
          .at(-1)
      : detail.order.latestActivityDate;
  return (
    <Dialog
      title={
        action === 'status' ? 'Update order progress' : 'Record order advance'
      }
      eyebrow={detail.order.orderCode}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={(event) => void save(event)}>
        <fieldset className="sale-builder-fields form-grid" disabled={busy}>
          {action === 'status' ? (
            <>
              <label className="full-width">
                Next status
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {statuses
                    .filter(
                      (value) =>
                        value !== 'CANCELLED' || can('records.correct'),
                    )
                    .map((value) => (
                      <option key={value} value={value}>
                        {statusTitle[value as keyof typeof statusTitle]}
                      </option>
                    ))}
                </select>
              </label>
              {status === 'CANCELLED' && (
                <p className="account-scope-note full-width">
                  Cancellation retains the order and payment history. It does
                  not refund money or change stock. Record money actually
                  returned using the customer account’s advance refund action.
                </p>
              )}
            </>
          ) : (
            <>
              <label>
                Amount received (NPR)
                <input
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                Method
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank</option>
                  <option value="DIGITAL_WALLET">Digital wallet</option>
                </select>
              </label>
              <label className="full-width">
                Payment reference (optional)
                <input
                  maxLength={160}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </label>
            </>
          )}
          <label className="full-width">
            {action === 'status' ? 'Progress date (AD)' : 'Payment date (AD)'}
            <input
              required
              type="date"
              min={minDate}
              max={nepalToday()}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="full-width">
            {action === 'status'
              ? 'Reason / progress note'
              : 'Notes (optional)'}
            <textarea
              required={action === 'status'}
              minLength={action === 'status' ? 5 : undefined}
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </fieldset>
        {action === 'payment' && (
          <p className="account-scope-note">
            This credits the customer’s overall account once. Correct a mistaken
            payment from the customer account, where its order link is retained.
          </p>
        )}
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
            Keep order
          </button>
          <button
            className={`button ${action === 'status' && status === 'CANCELLED' ? 'danger' : 'primary'}`}
            disabled={busy}
          >
            {busy
              ? 'Saving…'
              : action === 'status'
                ? 'Save progress'
                : 'Record advance'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
