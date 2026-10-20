import { t, message, useLanguage } from '../i18n/language';
import { useState, type FormEvent } from 'react';
import {
  customerListSchema,
  orderDetailSchema,
  inventoryListSchema,
  nepalToday,
  postSaleSchema,
  rateBookSchema,
  saleDetailSchema,
  saleDraftSchema,
  salePreviewSchema,
  type Customer,
  type InventoryItem,
  type SaleDraft,
  type SalePreview,
} from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { request, errorMessage } from '../shared/api';
import { useDebounced, useResource } from '../shared/useResource';
import { Icon } from '../shared/ui';
import { balance, money } from '../customers/format';
import { SaleFigures } from './SaleFigures';

type SelectedLine = {
  item: InventoryItem;
  wastageGrams: string;
  makingNpr: string;
  stonesNpr: string;
};
export function SaleBuilder({ orderId }: { orderId: string | null }) {
  useLanguage();

  const [requestId] = useState(() => globalThis.crypto.randomUUID());
  const [customerSearch, setCustomerSearch] = useState('');
  const [stockSearch, setStockSearch] = useState('');
  const customerTerm = useDebounced(customerSearch),
    stockTerm = useDebounced(stockSearch);
  const [pickedCustomer, setCustomer] = useState<Customer | null>(null);
  const [date, setDate] = useState(() => nepalToday());
  const [lines, setLines] = useState<SelectedLine[]>([]);
  const [discount, setDiscount] = useState('0'),
    [tax, setTax] = useState('0'),
    [payment, setPayment] = useState('0');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState(''),
    [bill, setBill] = useState(''),
    [notes, setNotes] = useState('');
  const [revision, setRevision] = useState(0);
  const [review, setReview] = useState<{
    draft: SaleDraft;
    quote: SalePreview;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const customers = useResource(
    `/customers?search=${encodeURIComponent(customerTerm)}&pageSize=20`,
    customerListSchema,
    revision,
  );
  const stock = useResource(
    `/inventory/items?status=AVAILABLE&search=${encodeURIComponent(stockTerm)}&pageSize=20`,
    inventoryListSchema,
    revision,
  );
  const rates = useResource(
    `/rates?date=${encodeURIComponent(date)}`,
    rateBookSchema,
    revision,
  );
  const linkedOrder = useResource(
    `/orders/${encodeURIComponent(orderId ?? '')}`,
    orderDetailSchema,
    revision,
    orderId !== null,
  );
  const customer = orderId
    ? (linkedOrder.data?.customer ?? null)
    : pickedCustomer;
  const matchingRate = (item: InventoryItem) =>
    rates.data?.rates.find(
      (rate) => rate.metal === item.metal && rate.fineness === item.fineness,
    );
  function updateLine(
    id: string,
    field: 'wastageGrams' | 'makingNpr' | 'stonesNpr',
    value: string,
  ) {
    setLines((lines) =>
      lines.map((line) =>
        line.item.id === id ? { ...line, [field]: value } : line,
      ),
    );
  }
  async function preview(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed = saleDraftSchema.safeParse({
      customerId: customer?.id,
      orderId,
      saleDate: date,
      lines: lines.map((line) => ({
        itemId: line.item.id,
        rateId: matchingRate(line.item)?.id,
        wastageGrams: line.wastageGrams,
        makingNpr: line.makingNpr,
        stonesNpr: line.stonesNpr,
      })),
      discountNpr: discount,
      taxNpr: tax,
      paymentNpr: payment,
      paymentMethod: Number(payment) > 0 ? method : null,
      paymentReference: reference,
      billReference: bill,
      notes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('\n'));
      return;
    }
    setBusy(true);
    try {
      const quote = await request('/sales/preview', salePreviewSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      setReview({ draft: parsed.data, quote });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function post() {
    if (!review) return;
    setBusy(true);
    setError('');
    try {
      const input = postSaleSchema.parse({
        ...review.draft,
        requestId,
        expectedOrderVersion: review.quote.order?.version ?? null,
        expectedTotalNpr: review.quote.totalNpr,
        expectedCustomerVersion: review.quote.customer.version,
        expectedBalanceNpr: review.quote.balanceBeforeNpr,
      });
      const detail = await request('/sales', saleDetailSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      globalThis.location.hash = `/sales/${detail.sale.id}`;
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  if (
    orderId &&
    (linkedOrder.loading ||
      linkedOrder.error ||
      linkedOrder.data?.order.status !== 'READY')
  )
    return (
      <AppShell section="Sales">
        <a href={`#/orders/${orderId}`} className="back-link">
          {t('← Back to order')}
        </a>
        <div className="empty-state">
          <h2>
            {linkedOrder.loading
              ? t('Loading order…')
              : t('Order is not ready for delivery')}
          </h2>
          <p className="error" role="alert">
            {message(linkedOrder.error) ||
              (linkedOrder.loading
                ? ''
                : t(
                    'Refresh the order and mark it ready before recording its delivery.',
                  ))}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t('Refresh')}
          </button>
        </div>
      </AppShell>
    );
  const pickedBalance = customer ? balance(customer.balanceNpr) : null;
  return (
    <AppShell section="Sales">
      <a className="back-link" href="#/sales">
        {t('← Sales register')}
      </a>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {orderId
              ? t('CUSTOM ORDER DELIVERY')
              : t('READY-MADE JEWELLERY SALE')}
          </p>
          <h1>
            {review ? t('Review this sale') : t('Record a sale')}
            <span>.</span>
          </h1>
          <p className="description">
            {review
              ? t('Check the pieces, charges and settlement before posting.')
              : orderId
                ? t(
                    'Choose the finished pieces, then review delivery pricing and settlement.',
                  )
                : t(
                    'Choose a customer and available pieces, then review the final amounts.',
                  )}
          </p>
        </div>
        <span className="manual-badge">
          {review ? t('02 / REVIEW') : t('01 / DETAILS')}
        </span>
      </div>
      {linkedOrder.data && (
        <p className="order-delivery-banner">
          {t('Delivering')}{' '}
          <a href={`#/orders/${orderId}`}>{linkedOrder.data.order.orderCode}</a>{' '}
          {t('· Select all ')}
          {linkedOrder.data.order.pieceCount}{' '}
          {t(
            ' ordered pieces. Check their design and size against the order. Final prices use actual stock weights and the sale date’s rates. Recorded advances are already in the customer account.',
          )}
        </p>
      )}
      {linkedOrder.data && (
        <details className="stock-panel order-delivery-specs">
          <summary>{t('Ordered designs and planned charges')}</summary>
          <ul>
            {linkedOrder.data.order.lines.map((line, index) => (
              <li key={index}>
                <strong>
                  {line.name} × {line.quantity}
                </strong>{' '}
                · {line.metal === 'GOLD' ? t('Gold') : t('Silver')}{' '}
                {line.fineness}
                {t('‰ · Size: ')}
                {line.size || t('not specified')}
                <br />
                {line.design}
                <br />
                {t('Per piece: expected ')}
                {line.expectedNetWeightGrams} {t(' g net · planned wastage ')}
                {line.plannedWastageGrams} {t(' g · making NPR')}{' '}
                {money(line.plannedMakingNpr)} {t(' · stones NPR')}{' '}
                {money(line.plannedStonesNpr)}
              </li>
            ))}
          </ul>
          <p>
            {t('Enter the final agreed charges below for each finished piece.')}
          </p>
        </details>
      )}
      {review ? (
        <>
          <section className="stock-panel">
            <div className="stock-heading">
              <div>
                <h2>{review.quote.customer.name}</h2>
                <p>
                  {review.quote.customer.customerCode} · {review.quote.saleDate}{' '}
                  {t('AD · ')}
                  {review.quote.lines.length} {t(' pieces')}
                </p>
              </div>
              <span className="manual-badge">{t('REVIEW')}</span>
            </div>
            <SaleFigures lines={review.quote.lines} totals={review.quote} />
            <div className="sale-review-reference">
              <p>
                {t('Bill reference: ')}
                {review.draft.billReference || t('Not entered')}
              </p>
              {review.draft.notes && <p>{review.draft.notes}</p>}
            </div>
          </section>
          <p className="account-scope-note">
            {t(
              'Posting records this sale, removes its pieces from available stock and updates the customer account. Use the shop’s approved billing process for the official invoice.',
            )}
          </p>
          {error && (
            <p className="error" role="alert">
              {message(error)}
            </p>
          )}
          <div className="sale-page-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setReview(null);
                setError('');
                setRevision((value) => value + 1);
              }}
            >
              {t('Back to details')}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void post()}
            >
              {busy ? t('Posting…') : t('Post sale')}
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(event) => void preview(event)}>
          <fieldset disabled={busy} className="sale-builder-fields">
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('Customer & date')}</h2>
                  <p>
                    {t(
                      'All amounts will be recorded against this customer account.',
                    )}
                  </p>
                </div>
                <span className="register-label">01</span>
              </div>
              <div className="sale-form-content">
                <label className="date-filter">
                  {t('Sale date (AD)')}
                  <input
                    required
                    type="date"
                    min="2000-01-01"
                    max={nepalToday()}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                {customer && pickedBalance ? (
                  <div className="selected-customer">
                    <div>
                      <strong>{customer.name}</strong>
                      <small>
                        {customer.customerCode} · {t(pickedBalance.label)}
                        {t(': NPR')} {pickedBalance.amount}
                      </small>
                    </div>
                    <button
                      className="text-button"
                      type="button"
                      disabled={orderId !== null}
                      onClick={() => setCustomer(null)}
                    >
                      {t('Change customer')}
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="search">
                      <Icon name="search" size={18} />
                      <input
                        aria-label={t('Find sale customer')}
                        placeholder={t('Search customer name, phone or code…')}
                        value={customerSearch}
                        onChange={(event) =>
                          setCustomerSearch(event.target.value)
                        }
                        maxLength={120}
                      />
                    </label>
                    <div className="sale-picker-list">
                      {customers.loading ? (
                        <p className="muted">{t('Loading customers…')}</p>
                      ) : customers.error ? (
                        <p className="error" role="alert">
                          {message(customers.error)}
                        </p>
                      ) : customers.data?.items.length ? (
                        customers.data.items.map((item) => (
                          <button
                            className="sale-picker-row"
                            type="button"
                            key={item.id}
                            onClick={() => setCustomer(item)}
                          >
                            <span>
                              <strong>{item.name}</strong>
                              <small>
                                {item.customerCode} ·{' '}
                                {item.phone || t('No phone')}
                              </small>
                            </span>
                            <Icon name="arrow" size={17} />
                          </button>
                        ))
                      ) : (
                        <p className="muted">
                          {t('No matching customer.')}{' '}
                          <a href="#/customers">
                            {t('Add the customer in Customers first.')}
                          </a>
                        </p>
                      )}
                    </div>
                    {customers.data && customers.data.total > 20 && (
                      <p className="field-hint">
                        {t(
                          'Showing 20 matches. Refine your search to find another customer.',
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>
                    {t('Choose pieces ')}
                    <span>{lines.length} / 20</span>
                  </h2>
                  <p>
                    {t(
                      'Each piece uses the latest rate for its exact metal and purity on the sale date.',
                    )}
                  </p>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  {t('Refresh stock & rates')}
                </button>
              </div>
              <div className="sale-form-content">
                <label className="search">
                  <Icon name="search" size={18} />
                  <input
                    aria-label={t('Find sale stock')}
                    placeholder={t(
                      'Search available item code, name or category…',
                    )}
                    value={stockSearch}
                    onChange={(event) => setStockSearch(event.target.value)}
                    maxLength={120}
                  />
                </label>
                {rates.error && (
                  <p className="error" role="alert">
                    {message(rates.error)}
                  </p>
                )}
                <div className="sale-picker-list stock-picker">
                  {stock.loading || rates.loading ? (
                    <p className="muted">
                      {t('Loading available stock and rates…')}
                    </p>
                  ) : stock.error ? (
                    <p className="error" role="alert">
                      {message(stock.error)}
                    </p>
                  ) : stock.data?.items.length ? (
                    stock.data.items.map((item) => {
                      const rate = matchingRate(item);
                      const added = lines.some(
                        (line) => line.item.id === item.id,
                      );
                      return (
                        <div className="sale-picker-row" key={item.id}>
                          <span>
                            <strong>{item.name}</strong>
                            <small>
                              {item.itemCode} ·{' '}
                              {item.metal === 'GOLD' ? t('Gold') : t('Silver')}{' '}
                              {item.fineness}‰ · {item.netWeightGrams}{' '}
                              {t(' g net')}
                            </small>
                            <small className={rate ? '' : 'danger-text'}>
                              {rate
                                ? t('NPR {value0} / tola', {
                                    value0: money(rate.sellRatePerTola),
                                  })
                                : t(
                                    'No matching rate on this date. Set it in Metal rates.',
                                  )}
                            </small>
                          </span>
                          <button
                            type="button"
                            className="button secondary compact"
                            disabled={added || !rate || lines.length >= 20}
                            aria-label={t('Add {value0}', {
                              value0: item.itemCode,
                            })}
                            onClick={() =>
                              setLines([
                                ...lines,
                                {
                                  item,
                                  wastageGrams: '0',
                                  makingNpr: '0',
                                  stonesNpr: '0',
                                },
                              ])
                            }
                          >
                            {added ? t('Added') : t('Add piece')}
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="muted">
                      {t('No available pieces match this search.')}{' '}
                      <a href="#/inventory">
                        {t('Receive stock in Inventory first.')}
                      </a>
                    </p>
                  )}
                </div>
                {stock.data && stock.data.total > 20 && (
                  <p className="field-hint">
                    {t(
                      'Showing 20 matches. Refine your search to find another piece.',
                    )}
                  </p>
                )}
                {lines.map((line) => (
                  <article className="sale-selected-line" key={line.item.id}>
                    <div className="sale-line-heading">
                      <div>
                        <strong>{line.item.name}</strong>
                        <small>
                          {line.item.itemCode} · {line.item.netWeightGrams}{' '}
                          {t(' g net')}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t('Remove {value0}', {
                          value0: line.item.itemCode,
                        })}
                        onClick={() =>
                          setLines(
                            lines.filter(
                              (selected) => selected.item.id !== line.item.id,
                            ),
                          )
                        }
                      >
                        <Icon name="close" size={17} />
                      </button>
                    </div>
                    <div className="sale-charge-inputs">
                      <label>
                        {t('Billed wastage (g)')}
                        <input
                          aria-label={t('Billed wastage for {value0}', {
                            value0: line.item.itemCode,
                          })}
                          required
                          inputMode="decimal"
                          value={line.wastageGrams}
                          onChange={(event) =>
                            updateLine(
                              line.item.id,
                              'wastageGrams',
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label>
                        {t('Making charge (NPR)')}
                        <input
                          aria-label={t('Making charge for {value0}', {
                            value0: line.item.itemCode,
                          })}
                          required
                          inputMode="decimal"
                          value={line.makingNpr}
                          onChange={(event) =>
                            updateLine(
                              line.item.id,
                              'makingNpr',
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label>
                        {t('Stone charge (NPR)')}
                        <input
                          aria-label={t('Stone charge for {value0}', {
                            value0: line.item.itemCode,
                          })}
                          required
                          inputMode="decimal"
                          value={line.stonesNpr}
                          onChange={(event) =>
                            updateLine(
                              line.item.id,
                              'stonesNpr',
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    </div>
                    {!matchingRate(line.item) && (
                      <p className="error">
                        {t('A matching rate is required for ')}
                        {line.item.itemCode} {t(' on this date.')}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('Charges & settlement')}</h2>
                  <p>
                    {t(
                      'Enter the amounts agreed with the customer. Existing advances are applied to the remaining sale amount.',
                    )}
                  </p>
                </div>
                <span className="register-label">03</span>
              </div>
              <div className="sale-form-content form-grid">
                <label>
                  {t('Discount (NPR)')}
                  <input
                    required
                    inputMode="decimal"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                  />
                </label>
                <label>
                  {t('Tax / fees from bill (NPR)')}
                  <input
                    required
                    inputMode="decimal"
                    value={tax}
                    onChange={(event) => setTax(event.target.value)}
                  />
                </label>
                <label>
                  {t('Received now for this sale (NPR)')}
                  <input
                    required
                    inputMode="decimal"
                    value={payment}
                    onChange={(event) => setPayment(event.target.value)}
                  />
                </label>
                <label>
                  {t('Payment method')}
                  <select
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                    disabled={Number(payment) <= 0}
                  >
                    <option value="CASH">{t('Cash')}</option>
                    <option value="BANK">{t('Bank')}</option>
                    <option value="DIGITAL_WALLET">
                      {t('Digital wallet')}
                    </option>
                  </select>
                </label>
                <label>
                  {t('Payment reference (optional)')}
                  <input
                    maxLength={160}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </label>
                <label>
                  {t('Official bill reference (optional)')}
                  <input
                    maxLength={160}
                    value={bill}
                    onChange={(event) => setBill(event.target.value)}
                  />
                </label>
                <label className="full-width">
                  {t('Notes (optional)')}
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
            </section>
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {message(error)}
            </p>
          )}
          <div className="sale-page-actions">
            <a className="button secondary" href="#/sales">
              {t('Back to register')}
            </a>
            <button
              className="button primary"
              disabled={
                busy ||
                !customer ||
                !lines.length ||
                rates.loading ||
                lines.some((line) => !matchingRate(line.item))
              }
            >
              {busy ? t('Calculating…') : t('Review sale')}
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
