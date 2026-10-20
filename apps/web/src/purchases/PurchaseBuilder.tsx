import { t, message, useLanguage } from '../i18n/language';
import { useState, type FormEvent } from 'react';
import {
  customerListSchema,
  inventoryListSchema,
  nepalToday,
  orderDetailSchema,
  postPurchaseSchema,
  purchaseDetailSchema,
  purchaseDraftSchema,
  purchasePreviewSchema,
  rateBookSchema,
  type Customer,
  type InventoryItem,
  type PurchaseDraft,
  type PurchasePreview,
} from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { request, errorMessage } from '../shared/api';
import { useDebounced, useResource } from '../shared/useResource';
import { Icon } from '../shared/ui';
import { balance, money } from '../customers/format';
import { PurchaseFigures } from './PurchaseFigures';
const blank = () => ({
  key: globalThis.crypto.randomUUID(),
  name: '',
  metal: 'GOLD' as 'GOLD' | 'SILVER',
  fineness: '916.667',
  grossWeightGrams: '',
  nonMetalWeightGrams: '0',
  deductedWeightGrams: '0',
  deductionNpr: '0',
  deductionReason: '',
  assayNotes: '',
});
type Outgoing = {
  item: InventoryItem;
  wastageGrams: string;
  makingNpr: string;
  stonesNpr: string;
};
export function PurchaseBuilder({ orderId }: { orderId: string | null }) {
  useLanguage();

  const [requestId] = useState(() => globalThis.crypto.randomUUID()),
    [date, setDate] = useState(() => nepalToday()),
    [picked, setPicked] = useState<Customer | null>(null);
  const [search, setSearch] = useState(''),
    term = useDebounced(search),
    [stockSearch, setStockSearch] = useState(''),
    stockTerm = useDebounced(stockSearch);
  const [exchange, setExchange] = useState(orderId !== null),
    [lines, setLines] = useState(() => [blank()]),
    [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [payout, setPayout] = useState('0'),
    [received, setReceived] = useState('0'),
    [method, setMethod] = useState('CASH'),
    [paymentReference, setPaymentReference] = useState('');
  const [discount, setDiscount] = useState('0'),
    [tax, setTax] = useState('0'),
    [reference, setReference] = useState(''),
    [bill, setBill] = useState(''),
    [notes, setNotes] = useState('');
  const [revision, setRevision] = useState(0),
    [review, setReview] = useState<{
      draft: PurchaseDraft;
      quote: PurchasePreview;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const customers = useResource(
    `/customers?search=${encodeURIComponent(term)}&pageSize=20`,
    customerListSchema,
    revision,
    !orderId,
  );
  const order = useResource(
      `/orders/${encodeURIComponent(orderId ?? '')}`,
      orderDetailSchema,
      revision,
      orderId !== null,
    ),
    customer = orderId ? (order.data?.customer ?? null) : picked;
  const rates = useResource(`/rates?date=${date}`, rateBookSchema, revision),
    stock = useResource(
      `/inventory/items?status=AVAILABLE&search=${encodeURIComponent(stockTerm)}&pageSize=20`,
      inventoryListSchema,
      revision,
      exchange,
    );
  const match = (metal: string, fineness: string) =>
    rates.data?.rates.find(
      (rate) =>
        rate.metal === metal && Number(rate.fineness) === Number(fineness),
    );
  function lineChange(key: string, fields: Partial<ReturnType<typeof blank>>) {
    setLines((lines) =>
      lines.map((line) => (line.key === key ? { ...line, ...fields } : line)),
    );
  }
  function outgoingChange(id: string, fields: Partial<Outgoing>) {
    setOutgoing((lines) =>
      lines.map((line) =>
        line.item.id === id ? { ...line, ...fields } : line,
      ),
    );
  }
  async function preview(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed = purchaseDraftSchema.safeParse({
      customerId: customer?.id,
      purchaseDate: date,
      lines: lines.map(({ key, ...line }) => {
        void key;
        return { ...line, rateId: match(line.metal, line.fineness)?.id };
      }),
      payoutNpr: payout,
      payoutMethod: Number(payout) > 0 ? method : null,
      payoutReference: paymentReference,
      reference,
      notes,
      sale: exchange
        ? {
            customerId: customer?.id,
            orderId,
            saleDate: date,
            lines: outgoing.map((line) => ({
              itemId: line.item.id,
              rateId: match(line.item.metal, line.item.fineness)?.id,
              wastageGrams: line.wastageGrams,
              makingNpr: line.makingNpr,
              stonesNpr: line.stonesNpr,
            })),
            discountNpr: discount,
            taxNpr: tax,
            paymentNpr: received,
            paymentMethod: Number(received) > 0 ? method : null,
            paymentReference,
            billReference: bill,
            notes,
          }
        : null,
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('\n'),
      );
      return;
    }
    setBusy(true);
    try {
      const quote = await request('/purchases/preview', purchasePreviewSchema, {
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
      const input = postPurchaseSchema.parse({
        ...review.draft,
        requestId,
        expectedPurchaseNpr: review.quote.totalNpr,
        expectedSaleNpr: review.quote.sale?.totalNpr ?? '0',
        expectedCustomerVersion: review.quote.customer.version,
        expectedOrderVersion: review.quote.sale?.order?.version ?? null,
        expectedBalanceNpr: review.quote.balanceBeforeNpr,
      });
      const detail = await request('/purchases', purchaseDetailSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      globalThis.location.hash = `/purchases/${detail.purchase.id}`;
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  const account = customer ? balance(customer.balanceNpr) : null;
  if (
    orderId &&
    (order.loading || order.error || order.data?.order.status !== 'READY')
  )
    return (
      <AppShell section="Purchases">
        <a className="back-link" href={`#/orders/${orderId}`}>
          {t('common.labels.backToOrder')}
        </a>
        <div className="empty-state">
          <h2>
            {order.loading
              ? t('common.labels.loadingOrder')
              : t(
                  'purchases.purchaseBuilder.theOrderMustBeReadyBeforeDelivery',
                )}
          </h2>
          {order.error && (
            <p className="error" role="alert">
              {message(order.error)}
            </p>
          )}
        </div>
      </AppShell>
    );
  return (
    <AppShell section="Purchases">
      <a className="back-link" href="#/purchases">
        {t('purchases.labels.purchaseRegister')}
      </a>
      <div className="page-heading">
        <div>
          <h1>
            {review
              ? t('purchases.purchaseBuilder.reviewSettlement')
              : t('purchases.purchaseBuilder.buyOrExchangeMetal')}
            <span>.</span>
          </h1>
          <p className="description">
            {review
              ? t('purchases.purchaseBuilder.reviewDescription')
              : t(
                  'purchases.purchaseBuilder.recordTheAssessedMetalAndTheAmountAgreed',
                )}
          </p>
        </div>
        <span className="manual-badge">
          {review ? t('common.steps.review') : t('common.steps.details')}
        </span>
      </div>
      {order.data && (
        <div className="order-delivery-banner">
          {t('common.labels.delivering')}{' '}
          <a href={`#/orders/${orderId}`}>{order.data.order.orderCode}</a>
          {t('purchases.purchaseBuilder.selectAll') + ' '}
          {order.data.order.pieceCount}{' '}
          {' ' +
            t(
              'purchases.purchaseBuilder.orderedPiecesCheckDesignAndSizeAgainstThe',
            )}
        </div>
      )}
      {review ? (
        <>
          <section className="stock-panel">
            <div className="stock-heading">
              <div>
                <h2>{review.quote.customer.name}</h2>
                <p>
                  {date} {' ' + t('common.dates.adSeparator') + ' '}
                  {exchange
                    ? t('purchases.labels.exchange')
                    : t('common.labels.oldMetalPurchase')}{' '}
                  {' ' + t('purchases.purchaseBuilder.npr')}
                </p>
              </div>
            </div>
            <PurchaseFigures
              lines={review.quote.lines}
              totalNpr={review.quote.totalNpr}
              saleLines={review.quote.sale?.lines ?? []}
              saleTotalNpr={review.quote.sale?.totalNpr ?? '0'}
              receivedNpr={review.draft.sale?.paymentNpr ?? '0'}
              payoutNpr={review.draft.payoutNpr}
              balanceBeforeNpr={review.quote.balanceBeforeNpr}
              balanceAfterNpr={review.quote.balanceAfterNpr}
            />
            <p className="sale-review-reference">
              {t('purchases.purchaseBuilder.purchaseReference') + ' '}
              {reference || t('common.labels.notEntered')}{' '}
              {' ' + t('purchases.purchaseBuilder.method')}{' '}
              {Number(payout) > 0 || Number(received) > 0
                ? method.replaceAll('_', ' ')
                : t('purchases.purchaseBuilder.accountCreditOnly')}
            </p>
          </section>
          <p className="account-scope-note">
            {t('purchases.purchaseBuilder.postingHelp')}
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
                setRevision((v) => v + 1);
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
                : t('purchases.purchaseBuilder.postSettlement')}
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(event) => void preview(event)}>
          <fieldset className="sale-builder-fields" disabled={busy}>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('common.labels.customerDate')}</h2>
                  <p>{t('purchases.purchaseBuilder.accountCreditHelp')}</p>
                </div>
              </div>
              <div className="sale-form-content">
                <label className="date-filter">
                  {t('purchases.purchaseBuilder.purchaseExchangeDateAd')}
                  <input
                    required
                    type="date"
                    max={nepalToday()}
                    min={customer?.latestEntryDate ?? '2000-01-01'}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                {customer && account ? (
                  <div className="selected-customer">
                    <div>
                      <strong>{customer.name}</strong>
                      <small>
                        {customer.customerCode} · {t(account.label)}
                        {t('common.labels.npr')} {account.amount}
                      </small>
                    </div>
                    {!orderId && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setPicked(null)}
                      >
                        {t('common.labels.changeCustomer')}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <label className="search">
                      <Icon name="search" size={18} />
                      <input
                        aria-label={t(
                          'purchases.purchaseBuilder.findPurchaseCustomer',
                        )}
                        placeholder={t(
                          'common.labels.searchCustomerNamePhoneOrCode',
                        )}
                        maxLength={120}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
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
                            type="button"
                            className="sale-picker-row"
                            key={item.id}
                            onClick={() => setPicked(item)}
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
                            {t('purchases.purchaseBuilder.addTheCustomerFirst')}
                          </a>
                        </p>
                      )}
                    </div>
                    {customers.data && customers.data.total > 20 && (
                      <p className="field-hint">
                        {t(
                          'purchases.purchaseBuilder.showing20MatchesRefineYourSearch',
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('purchases.purchaseBuilder.incomingOldMetal')}</h2>
                  <p>{t('purchases.purchaseBuilder.measurementHelp')}</p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setRevision((v) => v + 1)}
                >
                  {t('purchases.purchaseBuilder.refreshRates')}
                </button>
              </div>
              <div className="sale-form-content">
                {rates.error && (
                  <p className="error" role="alert">
                    {message(rates.error)}
                  </p>
                )}
                {lines.map((line, index) => {
                  const rate = match(line.metal, line.fineness);
                  return (
                    <article className="order-spec-editor" key={line.key}>
                      <div className="sale-line-heading">
                        <strong>
                          {t('purchases.purchaseBuilder.incomingLot') + ' '}
                          {index + 1}
                        </strong>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={t(
                            'purchases.purchaseBuilder.removeIncomingLot',
                            {
                              position: index + 1,
                            },
                          )}
                          disabled={lines.length === 1}
                          onClick={() =>
                            setLines(lines.filter((l) => l.key !== line.key))
                          }
                        >
                          <Icon name="close" size={17} />
                        </button>
                      </div>
                      <div className="form-grid">
                        <label>
                          {t('purchases.purchaseBuilder.description')}
                          <input
                            aria-label={t(
                              'purchases.purchaseBuilder.incomingDescription',
                              {
                                position: index + 1,
                              },
                            )}
                            required
                            maxLength={120}
                            value={line.name}
                            onChange={(e) =>
                              lineChange(line.key, { name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          {t('common.labels.metal')}
                          <select
                            aria-label={t(
                              'purchases.purchaseBuilder.incomingMetal',
                              {
                                position: index + 1,
                              },
                            )}
                            value={line.metal}
                            onChange={(e) =>
                              lineChange(line.key, {
                                metal: e.target.value as 'GOLD' | 'SILVER',
                                fineness:
                                  e.target.value === 'GOLD' ? '916.667' : '925',
                              })
                            }
                          >
                            <option value="GOLD">
                              {t('common.metals.gold')}
                            </option>
                            <option value="SILVER">
                              {t('common.metals.silver')}
                            </option>
                          </select>
                        </label>
                        <label>
                          {t('purchases.purchaseBuilder.assessedPurity')}
                          <input
                            aria-label={t(
                              'purchases.purchaseBuilder.incomingPurity',
                              {
                                position: index + 1,
                              },
                            )}
                            required
                            inputMode="decimal"
                            value={line.fineness}
                            onChange={(e) =>
                              lineChange(line.key, { fineness: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          {t('common.labels.grossWeightG')}
                          <input
                            aria-label={t(
                              'purchases.purchaseBuilder.incomingGrossWeight',
                              {
                                position: index + 1,
                              },
                            )}
                            required
                            inputMode="decimal"
                            value={line.grossWeightGrams}
                            onChange={(e) =>
                              lineChange(line.key, {
                                grossWeightGrams: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          {t('common.labels.stoneOtherWeightG')}
                          <input
                            aria-label={t(
                              'purchases.purchaseBuilder.incomingStoneWeight',
                              {
                                position: index + 1,
                              },
                            )}
                            required
                            inputMode="decimal"
                            value={line.nonMetalWeightGrams}
                            onChange={(e) =>
                              lineChange(line.key, {
                                nonMetalWeightGrams: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          {t(
                            'purchases.purchaseBuilder.agreedWeightDeductionG',
                          )}
                          <input
                            aria-label={t(
                              'purchases.purchaseBuilder.incomingWeightDeduction',
                              { position: index + 1 },
                            )}
                            required
                            inputMode="decimal"
                            value={line.deductedWeightGrams}
                            onChange={(e) =>
                              lineChange(line.key, {
                                deductedWeightGrams: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          {t('purchases.purchaseBuilder.otherDeductionNpr')}
                          <input
                            aria-label={t(
                              'purchases.purchaseBuilder.incomingMoneyDeduction',
                              {
                                position: index + 1,
                              },
                            )}
                            required
                            inputMode="decimal"
                            value={line.deductionNpr}
                            onChange={(e) =>
                              lineChange(line.key, {
                                deductionNpr: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          {t('purchases.purchaseBuilder.deductionReason')}
                          <input
                            aria-label={t(
                              'purchases.purchaseBuilder.deductionReason2',
                              {
                                position: index + 1,
                              },
                            )}
                            maxLength={500}
                            value={line.deductionReason}
                            onChange={(e) =>
                              lineChange(line.key, {
                                deductionReason: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="full-width">
                          {t(
                            'purchases.purchaseBuilder.assayMethodAssessmentNotes',
                          )}
                          <textarea
                            aria-label={t(
                              'purchases.purchaseBuilder.assayNotes',
                              {
                                position: index + 1,
                              },
                            )}
                            required
                            minLength={3}
                            maxLength={500}
                            rows={2}
                            value={line.assayNotes}
                            onChange={(e) =>
                              lineChange(line.key, {
                                assayNotes: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <p className={rate ? 'field-hint' : 'error'}>
                        {rates.loading
                          ? t('purchases.purchaseBuilder.loadingQuote')
                          : rate
                            ? t(
                                'purchases.purchaseBuilder.buyingQuoteNprTolaGTola',
                                {
                                  rate: money(rate.buyRatePerTola),
                                  gramsPerTola: rate.gramsPerTola,
                                },
                              )
                            : t(
                                'purchases.purchaseBuilder.noMatchingBuyingQuoteOnThisDateSet',
                              )}
                      </p>
                    </article>
                  );
                })}
                <button
                  type="button"
                  className="button secondary"
                  disabled={lines.length >= 20}
                  onClick={() => setLines([...lines, blank()])}
                >
                  <Icon name="plus" size={16} />
                  {t('purchases.purchaseBuilder.addIncomingLot')}
                </button>
                <p className="field-hint">
                  {t(
                    'purchases.purchaseBuilder.deductionsReducePayableValueTheyDoNotRemove',
                  )}
                </p>
              </div>
            </section>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('purchases.purchaseBuilder.exchangeForJewellery')}</h2>
                  <p>{t('purchases.purchaseBuilder.exchangeHelp')}</p>
                </div>
                <label className="overdue-toggle">
                  <input
                    type="checkbox"
                    checked={exchange}
                    disabled={orderId !== null}
                    onChange={(e) => setExchange(e.target.checked)}
                  />
                  {t('purchases.purchaseBuilder.includeJewellerySale')}
                </label>
              </div>
              {exchange && (
                <div className="sale-form-content">
                  <label className="search">
                    <Icon name="search" size={18} />
                    <input
                      aria-label={t(
                        'purchases.purchaseBuilder.findExchangeStock',
                      )}
                      placeholder={t(
                        'purchases.purchaseBuilder.searchAvailablePieces',
                      )}
                      maxLength={120}
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                    />
                  </label>
                  <div className="sale-picker-list">
                    {stock.loading ? (
                      <p className="muted">
                        {t('purchases.purchaseBuilder.loadingStock')}
                      </p>
                    ) : stock.error ? (
                      <p className="error" role="alert">
                        {message(stock.error)}
                      </p>
                    ) : (
                      stock.data?.items.map((item) => {
                        const added = outgoing.some(
                            (l) => l.item.id === item.id,
                          ),
                          rate = match(item.metal, item.fineness);
                        return (
                          <div className="sale-picker-row" key={item.id}>
                            <span>
                              <strong>{item.name}</strong>
                              <small>
                                {item.itemCode} · {item.fineness}‰ ·{' '}
                                {item.netWeightGrams}{' '}
                                {' ' + t('common.units.grams')}
                              </small>
                              <small>
                                {rate
                                  ? t(
                                      'purchases.purchaseBuilder.sellingQuoteNprTola',
                                      {
                                        amount: money(rate.sellRatePerTola),
                                      },
                                    )
                                  : t(
                                      'purchases.purchaseBuilder.setAMatchingSellingQuoteFirst',
                                    )}
                              </small>
                            </span>
                            <button
                              type="button"
                              className="button secondary compact"
                              disabled={added || !rate || outgoing.length >= 20}
                              aria-label={t(
                                'purchases.purchaseBuilder.exchange',
                                {
                                  position: item.itemCode,
                                },
                              )}
                              onClick={() =>
                                setOutgoing([
                                  ...outgoing,
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
                    )}
                  </div>
                  {stock.data && stock.data.total > 20 && (
                    <p className="field-hint">
                      {t(
                        'purchases.purchaseBuilder.showing20MatchesRefineYourSearch',
                      )}
                    </p>
                  )}
                  {stock.data?.total === 0 && (
                    <p className="muted">
                      {t(
                        'purchases.purchaseBuilder.receiveFinishedPiecesInInventoryFirst',
                      )}
                    </p>
                  )}
                  {outgoing.map((line) => (
                    <article className="sale-selected-line" key={line.item.id}>
                      <div className="sale-line-heading">
                        <div>
                          <strong>{line.item.name}</strong>
                          <small>
                            {line.item.itemCode} · {line.item.netWeightGrams}{' '}
                            {' ' + t('common.labels.gNet')}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={t(
                            'purchases.purchaseBuilder.removeOutgoing',
                            {
                              position: line.item.itemCode,
                            },
                          )}
                          onClick={() =>
                            setOutgoing(
                              outgoing.filter(
                                (l) => l.item.id !== line.item.id,
                              ),
                            )
                          }
                        >
                          <Icon name="close" size={17} />
                        </button>
                      </div>
                      <div className="sale-charge-inputs">
                        <label>
                          {t('common.labels.billedWastageG')}
                          <input
                            aria-label={t(
                              'purchases.purchaseBuilder.exchangeWastage',
                              {
                                position: line.item.itemCode,
                              },
                            )}
                            required
                            inputMode="decimal"
                            value={line.wastageGrams}
                            onChange={(e) =>
                              outgoingChange(line.item.id, {
                                wastageGrams: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          {t('purchases.purchaseBuilder.makingNpr')}
                          <input
                            aria-label={t(
                              'purchases.purchaseBuilder.exchangeMaking',
                              {
                                position: line.item.itemCode,
                              },
                            )}
                            required
                            inputMode="decimal"
                            value={line.makingNpr}
                            onChange={(e) =>
                              outgoingChange(line.item.id, {
                                makingNpr: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          {t('purchases.purchaseBuilder.stonesNpr')}
                          <input
                            aria-label={t(
                              'purchases.purchaseBuilder.exchangeStones',
                              {
                                position: line.item.itemCode,
                              },
                            )}
                            required
                            inputMode="decimal"
                            value={line.stonesNpr}
                            onChange={(e) =>
                              outgoingChange(line.item.id, {
                                stonesNpr: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    </article>
                  ))}
                  <div className="form-grid order-dates">
                    <label>
                      {t('purchases.purchaseBuilder.saleDiscountNpr')}
                      <input
                        required
                        inputMode="decimal"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                      />
                    </label>
                    <label>
                      {t(
                        'purchases.purchaseBuilder.taxFeesFromOfficialBillNpr',
                      )}
                      <input
                        required
                        inputMode="decimal"
                        value={tax}
                        onChange={(e) => setTax(e.target.value)}
                      />
                    </label>
                    <label className="full-width">
                      {t(
                        'purchases.purchaseBuilder.officialSaleBillReferenceOptional',
                      )}
                      <input
                        maxLength={160}
                        value={bill}
                        onChange={(e) => setBill(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}
            </section>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('purchases.purchaseBuilder.settlement')}</h2>
                  <p>
                    {t(
                      'purchases.purchaseBuilder.leaveBothAmountsAtZeroToRetainThe',
                    )}
                  </p>
                </div>
              </div>
              <div className="sale-form-content form-grid">
                {exchange && (
                  <label>
                    {t('purchases.purchaseBuilder.moneyReceivedNowNpr')}
                    <input
                      required
                      inputMode="decimal"
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  {t('purchases.purchaseBuilder.moneyPaidOutNowNpr')}
                  <input
                    required
                    inputMode="decimal"
                    value={payout}
                    onChange={(e) => setPayout(e.target.value)}
                  />
                </label>
                <label>
                  {t('purchases.purchaseBuilder.settlementMethod')}
                  <select
                    value={method}
                    disabled={
                      Number(payout) <= 0 &&
                      (!exchange || Number(received) <= 0)
                    }
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="CASH">{t('common.labels.cash')}</option>
                    <option value="BANK">{t('common.labels.bank')}</option>
                    <option value="DIGITAL_WALLET">
                      {t('common.labels.digitalWallet')}
                    </option>
                  </select>
                </label>
                <label>
                  {t('purchases.purchaseBuilder.paymentPayoutReference')}
                  <input
                    maxLength={160}
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </label>
                <label>
                  {t('purchases.purchaseBuilder.purchaseReferenceOptional')}
                  <input
                    maxLength={160}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                <label className="full-width">
                  {t('common.labels.notesOptional')}
                  <textarea
                    maxLength={500}
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </div>
            </section>
          </fieldset>
          <p className="account-scope-note">
            {t(
              'purchases.purchaseBuilder.theCreditFirstReducesEarlierCustomerDuesA',
            )}
          </p>
          {error && (
            <p className="error" role="alert">
              {message(error)}
            </p>
          )}
          <div className="sale-page-actions">
            <a className="button secondary" href="#/purchases">
              {t('common.labels.backToRegister')}
            </a>
            <button
              className="button primary"
              disabled={
                busy ||
                !customer ||
                rates.loading ||
                lines.some((line) => !match(line.metal, line.fineness)) ||
                (exchange && !outgoing.length)
              }
            >
              {busy
                ? t('common.labels.calculating')
                : t('purchases.purchaseBuilder.reviewSettlement')}
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
