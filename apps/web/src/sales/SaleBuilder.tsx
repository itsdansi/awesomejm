import { WeightValue } from '../shared/WeightValue';
import { WeightInput } from '../shared/WeightInput';
import { DateValue } from '../settings/DateValue';
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
          {t('common.labels.backToOrder')}
        </a>
        <div className="empty-state">
          <h2>
            {linkedOrder.loading
              ? t('common.labels.loadingOrder')
              : t('sales.saleBuilder.orderIsNotReadyForDelivery')}
          </h2>
          <p className="error" role="alert">
            {message(linkedOrder.error) ||
              (linkedOrder.loading
                ? ''
                : t('sales.saleBuilder.refreshTheOrderAndMarkItReadyBefore'))}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t('common.actions.refresh')}
          </button>
        </div>
      </AppShell>
    );
  const pickedBalance = customer ? balance(customer.balanceNpr) : null;
  return (
    <AppShell section="Sales">
      <a className="back-link" href="#/sales">
        {t('sales.labels.salesRegister')}
      </a>
      <div className="page-heading">
        <div>
          <h1>
            {review
              ? t('sales.saleBuilder.reviewThisSale')
              : t('common.labels.recordASale')}
          </h1>
        </div>
        <span className="manual-badge">
          {review ? t('common.steps.review') : t('common.steps.details')}
        </span>
      </div>
      {linkedOrder.data && (
        <p className="order-delivery-banner">
          {t('common.labels.delivering')}{' '}
          <a href={`#/orders/${orderId}`}>{linkedOrder.data.order.orderCode}</a>{' '}
          {t('sales.saleBuilder.selectAll') + ' '}
          {linkedOrder.data.order.pieceCount}{' '}
          {' ' +
            t('sales.saleBuilder.orderedPiecesCheckTheirDesignAndSizeAgainst')}
        </p>
      )}
      {linkedOrder.data && (
        <details className="stock-panel order-delivery-specs">
          <summary>
            {t('sales.saleBuilder.orderedDesignsAndPlannedCharges')}
          </summary>
          <ul>
            {linkedOrder.data.order.lines.map((line, index) => (
              <li key={index}>
                <strong>
                  {line.name} × {line.quantity}
                </strong>{' '}
                ·{' '}
                {line.metal === 'GOLD'
                  ? t('common.metals.gold')
                  : t('common.metals.silver')}{' '}
                {line.fineness}
                {t('sales.saleBuilder.size') + ' '}
                {line.size || t('sales.saleBuilder.notSpecified')}
                <br />
                {line.design}
                <br />
                {t('sales.saleBuilder.perPieceExpected') + ' '}
                <WeightValue grams={line.expectedNetWeightGrams} />{' '}
                {' / ' + t('weights.fields.wastage') + ' '}
                <WeightValue grams={line.plannedWastageGrams} />{' '}
                {' / ' + t('sales.saleBuilder.makingChargeNpr')}{' '}
                {money(line.plannedMakingNpr)}{' '}
                {' ' + t('sales.saleBuilder.stonesNpr')}{' '}
                {money(line.plannedStonesNpr)}
              </li>
            ))}
          </ul>
          <p>{t('sales.saleBuilder.enterTheFinalAgreedChargesBelowForEach')}</p>
        </details>
      )}
      {review ? (
        <>
          <section className="stock-panel">
            <div className="stock-heading">
              <div>
                <h2>{review.quote.customer.name}</h2>
                <p>
                  {review.quote.customer.customerCode} ·{' '}
                  <DateValue value={review.quote.saleDate} /> {' · '}
                  {review.quote.lines.length} {' ' + t('common.labels.pieces')}
                </p>
              </div>
              <span className="manual-badge">
                {t('sales.saleBuilder.review')}
              </span>
            </div>
            <SaleFigures lines={review.quote.lines} totals={review.quote} />
            <div className="sale-review-reference">
              <p>
                {t('sales.saleBuilder.billReference') + ' '}
                {review.draft.billReference || t('common.labels.notEntered')}
              </p>
              {review.draft.notes && <p>{review.draft.notes}</p>}
            </div>
          </section>
          <p className="account-scope-note">
            {t('sales.saleBuilder.postingRecordsThisSaleRemovesItsPiecesFrom')}
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
              {t('common.labels.backToDetails')}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void post()}
            >
              {busy
                ? t('common.labels.posting')
                : t('sales.saleBuilder.postSale')}
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
                  <h2>{t('common.labels.customerDate')}</h2>
                </div>
              </div>
              <div className="sale-form-content">
                <label className="date-filter">
                  {t('sales.saleBuilder.saleDateAd')}
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
                        {t('common.labels.npr')} {pickedBalance.amount}
                      </small>
                    </div>
                    <button
                      className="text-button"
                      type="button"
                      disabled={orderId !== null}
                      onClick={() => setCustomer(null)}
                    >
                      {t('common.labels.changeCustomer')}
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="search">
                      <Icon name="search" size={18} />
                      <input
                        aria-label={t('sales.saleBuilder.findSaleCustomer')}
                        placeholder={t(
                          'common.labels.searchCustomerNamePhoneOrCode',
                        )}
                        value={customerSearch}
                        onChange={(event) =>
                          setCustomerSearch(event.target.value)
                        }
                        maxLength={120}
                      />
                    </label>
                    <div className="sale-picker-list">
                      {customers.loading ? (
                        <p className="muted">
                          {t('common.labels.loadingCustomers')}
                        </p>
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
                                {item.phone || t('common.labels.noPhone')}
                              </small>
                            </span>
                            <Icon name="arrow" size={17} />
                          </button>
                        ))
                      ) : (
                        <p className="muted">
                          {t('common.labels.noMatchingCustomer')}{' '}
                          <a href="#/customers">
                            {t('common.labels.addTheCustomerInCustomersFirst')}
                          </a>
                        </p>
                      )}
                    </div>
                    {customers.data && customers.data.total > 20 && (
                      <p className="field-hint">
                        {t(
                          'common.labels.showing20MatchesRefineYourSearchToFind',
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
                    {t('sales.saleBuilder.choosePieces') + ' '}
                    <span>{lines.length} / 20</span>
                  </h2>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  {t('sales.saleBuilder.refreshStockRates')}
                </button>
              </div>
              <div className="sale-form-content">
                <label className="search">
                  <Icon name="search" size={18} />
                  <input
                    aria-label={t('sales.saleBuilder.findSaleStock')}
                    placeholder={t(
                      'sales.saleBuilder.searchAvailableItemCodeNameOrCategory',
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
                      {t('sales.saleBuilder.loadingAvailableStockAndRates')}
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
                              {item.metal === 'GOLD'
                                ? t('common.metals.gold')
                                : t('common.metals.silver')}{' '}
                              {item.fineness}‰ ·{' '}
                              <WeightValue
                                grams={item.netWeightGrams}
                                gramsPerTola={item.gramsPerTola}
                              />
                            </small>
                            <small className={rate ? '' : 'danger-text'}>
                              {rate
                                ? t('common.money.perTola', {
                                    amount: money(rate.sellRatePerTola),
                                  })
                                : t(
                                    'sales.saleBuilder.noMatchingRateOnThisDateSetIt',
                                  )}
                            </small>
                          </span>
                          <button
                            type="button"
                            className="button secondary compact"
                            disabled={added || !rate || lines.length >= 20}
                            aria-label={t('sales.saleBuilder.add', {
                              itemCode: item.itemCode,
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
                            {added
                              ? t('common.labels.added')
                              : t('common.labels.addPiece')}
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="muted">
                      {t('sales.saleBuilder.noAvailablePiecesMatchThisSearch')}{' '}
                      <a href="#/inventory">
                        {t('sales.saleBuilder.receiveStockInInventoryFirst')}
                      </a>
                    </p>
                  )}
                </div>
                {stock.data && stock.data.total > 20 && (
                  <p className="field-hint">
                    {t(
                      'sales.saleBuilder.showing20MatchesRefineYourSearchToFind',
                    )}
                  </p>
                )}
                {lines.map((line) => (
                  <article className="sale-selected-line" key={line.item.id}>
                    <div className="sale-line-heading">
                      <div>
                        <strong>{line.item.name}</strong>
                        <small>
                          {line.item.itemCode} ·{' '}
                          <WeightValue
                            grams={line.item.netWeightGrams}
                            gramsPerTola={line.item.gramsPerTola}
                          />
                        </small>
                      </div>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t('sales.saleBuilder.remove', {
                          itemCode: line.item.itemCode,
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
                      <WeightInput
                        label={t('weights.fields.wastage')}
                        ariaLabel={t('sales.saleBuilder.billedWastageFor', {
                          itemCode: line.item.itemCode,
                        })}
                        value={line.wastageGrams}
                        onChange={(value) =>
                          updateLine(line.item.id, 'wastageGrams', value)
                        }
                        gramsPerTola={matchingRate(line.item)?.gramsPerTola}
                      />
                      <label>
                        {t('sales.saleBuilder.makingChargeNpr')}
                        <input
                          aria-label={t('sales.saleBuilder.makingChargeFor', {
                            itemCode: line.item.itemCode,
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
                        {t('sales.saleBuilder.stoneChargeNpr')}
                        <input
                          aria-label={t('sales.saleBuilder.stoneChargeFor', {
                            itemCode: line.item.itemCode,
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
                        {t('sales.saleBuilder.aMatchingRateIsRequiredFor') +
                          ' '}
                        {line.item.itemCode}{' '}
                        {' ' + t('sales.saleBuilder.onThisDate')}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('sales.saleBuilder.chargesSettlement')}</h2>
                </div>
              </div>
              <div className="sale-form-content form-grid">
                <label>
                  {t('sales.saleBuilder.discountNpr')}
                  <input
                    required
                    inputMode="decimal"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                  />
                </label>
                <label>
                  {t('sales.saleBuilder.taxFeesFromBillNpr')}
                  <input
                    required
                    inputMode="decimal"
                    value={tax}
                    onChange={(event) => setTax(event.target.value)}
                  />
                </label>
                <label>
                  {t('sales.saleBuilder.receivedNowForThisSaleNpr')}
                  <input
                    required
                    inputMode="decimal"
                    value={payment}
                    onChange={(event) => setPayment(event.target.value)}
                  />
                </label>
                <label>
                  {t('common.labels.paymentMethod')}
                  <select
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                    disabled={Number(payment) <= 0}
                  >
                    <option value="CASH">{t('common.labels.cash')}</option>
                    <option value="BANK">{t('common.labels.bank')}</option>
                    <option value="DIGITAL_WALLET">
                      {t('common.labels.digitalWallet')}
                    </option>
                  </select>
                </label>
                <label>
                  {t('common.labels.paymentReferenceOptional')}
                  <input
                    maxLength={160}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </label>
                <label>
                  {t('sales.saleBuilder.officialBillReferenceOptional')}
                  <input
                    maxLength={160}
                    value={bill}
                    onChange={(event) => setBill(event.target.value)}
                  />
                </label>
                <label className="full-width">
                  {t('common.labels.notesOptional')}
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
              {t('common.labels.backToRegister')}
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
              {busy
                ? t('common.labels.calculating')
                : t('sales.saleBuilder.reviewSale')}
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
