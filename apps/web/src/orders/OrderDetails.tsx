import { WeightValue } from '../shared/WeightValue';
import { DateValue } from '../settings/DateValue';
import { t, message, useLanguage } from '../i18n/language';
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
import { AppShell } from '../shared/AppShell';
import { Dialog, Icon } from '../shared/ui';
import { useResource } from '../shared/useResource';
import { errorMessage, request } from '../shared/api';
import { balance, methodTitle, money } from '../customers/format';
import { statusClass, statusTitle } from './format';

export function OrderDetails({ orderId }: { orderId: string }) {
  useLanguage();
  const { user } = useAuth();

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
        {t('orders.labels.orderBook')}
      </a>
      {result.loading ? (
        <div className="empty-state" role="status">
          {t('common.labels.loadingOrder')}
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>{t('orders.orderDetails.orderCouldnTLoad')}</h2>
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
                  {t('orders.orderDetails.customOrder') + ' '}
                  <DateValue value={detail.order.orderDate} />
                </p>
                <h1>{detail.order.orderCode}</h1>
                <p className="description">
                  {detail.order.customerSnapshot.name} ·{' '}
                  {detail.order.pieceCount}{' '}
                  {detail.order.pieceCount === 1
                    ? t('common.labels.piece')
                    : t('common.labels.pieces')}{' '}
                  {' ' + t('orders.orderDetails.promised') + ' '}
                  <DateValue value={detail.order.dueDate} />
                </p>
              </div>
              <div className="order-heading-actions">
                <button
                  className="button secondary"
                  onClick={() => globalThis.print()}
                >
                  {t('orders.orderDetails.printOrderSlip')}
                </button>
                {!closed && (
                  <Permission name="orders.write">
                    <button
                      className="button primary"
                      onClick={() => setAction('status')}
                    >
                      {t('orders.orderDetails.updateProgress')}
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
                    {t('orders.orderDetails.awesomejmCustomOrder', {
                      shopName: user.shopName,
                    })}
                  </p>
                  <h2>
                    {detail.order.orderCode}{' '}
                    <span className={statusClass(detail.order.status)}>
                      {t(statusTitle[detail.order.status])}
                    </span>
                  </h2>
                  <p>
                    {t('orders.labels.booked') + ' '}
                    <DateValue value={detail.order.orderDate} />{' '}
                    {' ' + t('orders.orderDetails.adDelivery')}{' '}
                    <DateValue value={detail.order.dueDate} />{' '}
                    {detail.order.overdue
                      ? t('orders.orderDetails.overdue')
                      : ''}
                  </p>
                </div>
                <span
                  className={`manual-badge ${detail.order.overdue ? 'danger-text' : ''}`}
                >
                  {detail.order.overdue
                    ? t('orders.orderDetails.deliveryOverdue')
                    : t('orders.orderDetails.pieceCount', {
                        count: detail.order.pieceCount,
                        unit:
                          detail.order.pieceCount === 1 ? 'PIECE' : 'PIECES',
                      })}
                </span>
              </div>
              {detail.order.status !== 'CANCELLED' && (
                <ol
                  className="order-progress"
                  aria-label={t('common.labels.orderProgress')}
                >
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
                        {t(statusTitle[status])}
                      </li>
                    );
                  })}
                </ol>
              )}
              {detail.order.status === 'CANCELLED' && (
                <p className="receipt-reversed sale-cancelled">
                  {t('orders.orderDetails.cancelledHelp')}
                </p>
              )}
              <dl className="details-grid sale-customer-details">
                <div>
                  <dt>{t('orders.orderDetails.customerAtBooking')}</dt>
                  <dd>
                    {detail.order.customerSnapshot.name}
                    <small>{detail.order.customerSnapshot.customerCode}</small>
                  </dd>
                </div>
                <div>
                  <dt>{t('orders.orderDetails.phonePanAtBooking')}</dt>
                  <dd>
                    {detail.order.customerSnapshot.phone || '—'}
                    <small>
                      {t('common.labels.pan') + ' '}
                      {detail.order.customerSnapshot.pan || '—'}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>{t('orders.orderDetails.addressAtBooking')}</dt>
                  <dd>{detail.order.customerSnapshot.address || '—'}</dd>
                </div>
              </dl>
              <div className="order-specs">
                <p className="eyebrow">
                  {t('orders.orderDetails.orderedDesigns')}
                </p>
                {detail.order.lines.map((line, index) => (
                  <article className="order-spec" key={index}>
                    <div className="order-spec-title">
                      <span
                        className={`metal-badge ${line.metal.toLowerCase()}`}
                      >
                        {line.metal === 'GOLD'
                          ? t('common.metals.gold')
                          : t('common.metals.silver')}
                      </span>
                      <h3>{line.name}</h3>
                      <span className="muted">× {line.quantity}</span>
                    </div>
                    <p>{line.design}</p>
                    <dl>
                      <div>
                        <dt>{t('common.fields.purity')}</dt>
                        <dd>{line.fineness}‰</dd>
                      </div>
                      <div>
                        <dt>{t('orders.orderDetails.sizeMeasurement')}</dt>
                        <dd>
                          {line.size || t('orders.orderDetails.notSpecified')}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('orders.orderDetails.expectedNetPiece')}</dt>
                        <dd>
                          <WeightValue grams={line.expectedNetWeightGrams} />
                        </dd>
                      </div>
                      <div>
                        <dt>{t('orders.orderDetails.plannedWastagePiece')}</dt>
                        <dd>
                          <WeightValue grams={line.plannedWastageGrams} />
                        </dd>
                      </div>
                      <div>
                        <dt>{t('orders.orderDetails.plannedMakingPiece')}</dt>
                        <dd>
                          {t('common.money.currency') + ' '}
                          {money(line.plannedMakingNpr)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('orders.orderDetails.plannedStonesPiece')}</dt>
                        <dd>
                          {t('common.money.currency') + ' '}
                          {money(line.plannedStonesNpr)}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              <div className="order-finances">
                <div>
                  <p className="eyebrow">
                    {t('orders.orderDetails.estimatedOrderTotal')}
                  </p>
                  <strong>
                    {detail.order.estimatedTotalNpr === null
                      ? t('orders.labels.notSet')
                      : t('orders.orderDetails.amount', {
                          amount: money(detail.order.estimatedTotalNpr),
                        })}
                  </strong>
                  <small>
                    {t(
                      'orders.orderDetails.guideOnlyFinalPricingIsRecordedInSales',
                    )}
                  </small>
                </div>
                <div>
                  <p className="eyebrow">
                    {t('orders.orderDetails.paymentsTaggedToThisOrder')}
                  </p>
                  <strong>
                    {t('common.money.currency') + ' '}
                    {money(detail.order.taggedPaymentsNpr)}
                  </strong>
                  <small>
                    {t(
                      'orders.orderDetails.netOfCorrectionsCreditsTheCustomerSOverall',
                    )}
                  </small>
                </div>
              </div>
              {detail.order.notes && (
                <p className="sale-review-reference">{detail.order.notes}</p>
              )}
              <p className="receipt-disclaimer sale-disclaimer">
                {t(
                  'orders.orderDetails.internalOrderSlipNotATaxInvoiceExpected',
                )}
              </p>
            </section>
            <div className="order-followup">
              <div>
                <p className="eyebrow">
                  {t('orders.orderDetails.currentCustomerAccount')}
                </p>
                <strong className={currentBalance?.className}>
                  {t('common.money.currency') + ' '}
                  {currentBalance?.amount}
                </strong>
                <p>
                  {t(currentBalance?.label)}{' '}
                  {' ' +
                    t('orders.orderDetails.includesAllOrdersSalesAndPayments')}
                </p>
                <a
                  className="text-button"
                  href={`#/customers/${detail.customer.id}`}
                >
                  {t('common.labels.viewCustomerAccount')}
                </a>
              </div>
              <div className="order-followup-actions">
                {!closed && (
                  <Permission name="orders.write">
                    <button
                      className="button secondary"
                      onClick={() => setAction('payment')}
                    >
                      {t('orders.orderDetails.recordOrderAdvance')}
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
                        {t('orders.orderDetails.deliverThroughSales')}
                        <Icon name="arrow" size={17} />
                      </a>
                    </Permission>
                    <small>{t('orders.orderDetails.deliveryHelp')}</small>
                  </>
                )}
                {detail.order.status === 'READY' && (
                  <Permission name="purchases.write">
                    <a
                      className="button secondary"
                      href={`#/purchases/new?orderId=${detail.order.id}`}
                    >
                      {t('orders.orderDetails.deliverWithOldMetalExchange')}
                    </a>
                  </Permission>
                )}
                {detail.order.activeSaleId && (
                  <a
                    className="button primary"
                    href={`#/sales/${detail.order.activeSaleId}`}
                  >
                    {t('orders.orderDetails.viewDeliverySale')}
                  </a>
                )}
              </div>
            </div>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>
                    {t('orders.orderDetails.orderPayments') + ' '}
                    <span>{detail.payments.length}</span>
                  </h2>
                </div>
              </div>
              {detail.payments.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('settings.date')}</th>
                        <th>{t('common.labels.details')}</th>
                        <th className="numeric">
                          {t('orders.orderDetails.accountCreditNpr')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            <strong>{payment.entryCode}</strong>
                            <code>
                              <DateValue value={payment.entryDate} />
                            </code>
                          </td>
                          <td>
                            {payment.kind === 'REVERSAL'
                              ? t('orders.orderDetails.paymentReversed')
                              : payment.method
                                ? t(methodTitle[payment.method])
                                : t('orders.orderDetails.payment')}
                            {payment.reversed && (
                              <span className="reversed-badge">
                                {t('common.labels.reversed')}
                              </span>
                            )}
                            <small className="rate-subline">
                              {payment.reference}
                            </small>
                          </td>
                          <td className="numeric">
                            {payment.amountNpr.startsWith('-')
                              ? money(payment.amountNpr.slice(1))
                              : t('orders.orderDetails.negativeAmount', {
                                  amount: money(payment.amountNpr),
                                })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="order-no-payments">
                  {t('orders.orderDetails.noPaymentsTaggedToThisOrder')}
                </div>
              )}
            </section>
            <section className="stock-panel order-history">
              <div className="stock-heading">
                <div>
                  <h2>{t('orders.orderDetails.progressHistory')}</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  {t('common.actions.refresh')}
                </button>
              </div>
              <ol className="order-event-list">
                {detail.events.map((event) => (
                  <li key={event.id}>
                    <div>
                      <span className={statusClass(event.status)}>
                        {t(statusTitle[event.status])}
                      </span>
                      <span>
                        <DateValue value={event.eventDate} />
                      </span>
                      <small>
                        {t('common.labels.revision') + ' '}
                        {event.version}
                      </small>
                    </div>
                    <p>{event.reason}</p>
                    {event.saleId && (
                      <a
                        className="text-button"
                        href={`#/sales/${event.saleId}`}
                      >
                        {t('orders.orderDetails.viewLinkedSale')}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <p className="account-scope-note">
              {t('orders.orderDetails.specificationHistoryHelp')}
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
  useLanguage();

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
      setError(parsed.error.issues.map((issue) => issue.message).join('\n'));
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
        action === 'status'
          ? t('orders.orderDetails.updateOrderProgress')
          : t('orders.orderDetails.recordOrderAdvance')
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
                {t('orders.orderDetails.nextStatus')}
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
                        {t(statusTitle[value as keyof typeof statusTitle])}
                      </option>
                    ))}
                </select>
              </label>
              {status === 'CANCELLED' && (
                <p className="account-scope-note full-width">
                  {t('orders.orderDetails.cancellationHelp')}
                </p>
              )}
            </>
          ) : (
            <>
              <label>
                {t('orders.orderDetails.amountReceivedNpr')}
                <input
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                {t('common.labels.method')}
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  <option value="CASH">{t('common.labels.cash')}</option>
                  <option value="BANK">{t('common.labels.bank')}</option>
                  <option value="DIGITAL_WALLET">
                    {t('common.labels.digitalWallet')}
                  </option>
                </select>
              </label>
              <label className="full-width">
                {t('common.labels.paymentReferenceOptional')}
                <input
                  maxLength={160}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </label>
            </>
          )}
          <label className="full-width">
            {action === 'status'
              ? t('orders.orderDetails.progressDateAd')
              : t('orders.orderDetails.paymentDateAd')}
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
              ? t('orders.orderDetails.reasonProgressNote')
              : t('common.labels.notesOptional')}
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
            {t('orders.orderDetails.thisCreditsTheCustomerSOverallAccountOnce')}
          </p>
        )}
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
            {t('orders.orderDetails.keepOrder')}
          </button>
          <button
            className={`button ${action === 'status' && status === 'CANCELLED' ? 'danger' : 'primary'}`}
            disabled={busy}
          >
            {busy
              ? t('common.actions.saving')
              : action === 'status'
                ? t('orders.orderDetails.saveProgress')
                : t('orders.orderDetails.recordAdvance')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
