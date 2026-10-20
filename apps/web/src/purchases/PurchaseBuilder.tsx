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
          {t('← Back to order')}
        </a>
        <div className="empty-state">
          <h2>
            {order.loading
              ? t('Loading order…')
              : t('The order must be Ready before delivery')}
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
        {t('← Purchase register')}
      </a>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('WEIGH · VALUE · SETTLE')}</p>
          <h1>
            {review ? t('Review settlement') : t('Buy or exchange metal')}
            <span>.</span>
          </h1>
          <p className="description">
            {review
              ? t(
                  'Check incoming metal, outgoing pieces and the complete account effect.',
                )
              : t(
                  'Record the assessed metal and the amount agreed with the customer.',
                )}
          </p>
        </div>
        <span className="manual-badge">
          {review ? t('02 / REVIEW') : t('01 / DETAILS')}
        </span>
      </div>
      {order.data && (
        <div className="order-delivery-banner">
          {t('Delivering')}{' '}
          <a href={`#/orders/${orderId}`}>{order.data.order.orderCode}</a>
          {t('. Select all ')}
          {order.data.order.pieceCount}{' '}
          {t(
            ' ordered pieces. Check design and size against the order before posting.',
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
                  {date} {t(' AD · ')}
                  {exchange ? t('Exchange') : t('Old-metal purchase')}{' '}
                  {t(' · NPR')}
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
              {t('Purchase reference: ')}
              {reference || t('Not entered')} {t(' · Method:')}{' '}
              {Number(payout) > 0 || Number(received) > 0
                ? method.replaceAll('_', ' ')
                : t('Account credit only')}
            </p>
          </section>
          <p className="account-scope-note">
            {t(
              'Posting receives the complete physical net metal into old-metal lots and records the credit, optional jewellery sale and settlement together. This internal record does not issue an official invoice.',
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
                setRevision((v) => v + 1);
              }}
            >
              {t('Back to details')}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void post()}
            >
              {busy ? t('Posting…') : t('Post settlement')}
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
                  <h2>{t('Customer & date')}</h2>
                  <p>
                    {t(
                      'The purchase credits this customer’s existing account.',
                    )}
                  </p>
                </div>
                <span className="register-label">01</span>
              </div>
              <div className="sale-form-content">
                <label className="date-filter">
                  {t('Purchase / exchange date (AD)')}
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
                        {t(': NPR')} {account.amount}
                      </small>
                    </div>
                    {!orderId && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setPicked(null)}
                      >
                        {t('Change customer')}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <label className="search">
                      <Icon name="search" size={18} />
                      <input
                        aria-label={t('Find purchase customer')}
                        placeholder={t('Search customer name, phone or code…')}
                        maxLength={120}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
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
                            type="button"
                            className="sale-picker-row"
                            key={item.id}
                            onClick={() => setPicked(item)}
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
                            {t('Add the customer first.')}
                          </a>
                        </p>
                      )}
                    </div>
                    {customers.data && customers.data.total > 20 && (
                      <p className="field-hint">
                        {t('Showing 20 matches. Refine your search.')}
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('Incoming old metal')}</h2>
                  <p>
                    {t(
                      'Enter physical measurements and the assessed purity. The buying quote already applies to that purity.',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setRevision((v) => v + 1)}
                >
                  {t('Refresh rates')}
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
                          {t('Incoming lot ')}
                          {index + 1}
                        </strong>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={t('Remove incoming lot {value0}', {
                            value0: index + 1,
                          })}
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
                          {t('Description')}
                          <input
                            aria-label={t('Incoming description {value0}', {
                              value0: index + 1,
                            })}
                            required
                            maxLength={120}
                            value={line.name}
                            onChange={(e) =>
                              lineChange(line.key, { name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          {t('Metal')}
                          <select
                            aria-label={t('Incoming metal {value0}', {
                              value0: index + 1,
                            })}
                            value={line.metal}
                            onChange={(e) =>
                              lineChange(line.key, {
                                metal: e.target.value as 'GOLD' | 'SILVER',
                                fineness:
                                  e.target.value === 'GOLD' ? '916.667' : '925',
                              })
                            }
                          >
                            <option value="GOLD">{t('Gold')}</option>
                            <option value="SILVER">{t('Silver')}</option>
                          </select>
                        </label>
                        <label>
                          {t('Assessed purity (‰)')}
                          <input
                            aria-label={t('Incoming purity {value0}', {
                              value0: index + 1,
                            })}
                            required
                            inputMode="decimal"
                            value={line.fineness}
                            onChange={(e) =>
                              lineChange(line.key, { fineness: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          {t('Gross weight (g)')}
                          <input
                            aria-label={t('Incoming gross weight {value0}', {
                              value0: index + 1,
                            })}
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
                          {t('Stone / other weight (g)')}
                          <input
                            aria-label={t('Incoming stone weight {value0}', {
                              value0: index + 1,
                            })}
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
                          {t('Agreed weight deduction (g)')}
                          <input
                            aria-label={t(
                              'Incoming weight deduction {value0}',
                              { value0: index + 1 },
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
                          {t('Other deduction (NPR)')}
                          <input
                            aria-label={t('Incoming money deduction {value0}', {
                              value0: index + 1,
                            })}
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
                          {t('Deduction reason')}
                          <input
                            aria-label={t('Deduction reason {value0}', {
                              value0: index + 1,
                            })}
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
                          {t('Assay method / assessment notes')}
                          <textarea
                            aria-label={t('Assay notes {value0}', {
                              value0: index + 1,
                            })}
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
                          ? t('Loading quote…')
                          : rate
                            ? t(
                                'Buying quote: NPR {value0} / tola · {value1} g/tola',
                                {
                                  value0: money(rate.buyRatePerTola),
                                  value1: rate.gramsPerTola,
                                },
                              )
                            : t(
                                'No matching buying quote on this date. Set the exact purity in Metal rates first.',
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
                  {t('Add incoming lot')}
                </button>
                <p className="field-hint">
                  {t(
                    'Deductions reduce payable value. They do not remove physical net metal from the received lot.',
                  )}
                </p>
              </div>
            </section>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('Exchange for jewellery')}</h2>
                  <p>
                    {t(
                      'Select available pieces when supplying new jewellery against this purchase.',
                    )}
                  </p>
                </div>
                <label className="overdue-toggle">
                  <input
                    type="checkbox"
                    checked={exchange}
                    disabled={orderId !== null}
                    onChange={(e) => setExchange(e.target.checked)}
                  />
                  {t('Include jewellery sale')}
                </label>
              </div>
              {exchange && (
                <div className="sale-form-content">
                  <label className="search">
                    <Icon name="search" size={18} />
                    <input
                      aria-label={t('Find exchange stock')}
                      placeholder={t('Search available pieces…')}
                      maxLength={120}
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                    />
                  </label>
                  <div className="sale-picker-list">
                    {stock.loading ? (
                      <p className="muted">{t('Loading stock…')}</p>
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
                                {item.netWeightGrams} {t(' g')}
                              </small>
                              <small>
                                {rate
                                  ? t('Selling quote NPR {value0} / tola', {
                                      value0: money(rate.sellRatePerTola),
                                    })
                                  : t('Set a matching selling quote first.')}
                              </small>
                            </span>
                            <button
                              type="button"
                              className="button secondary compact"
                              disabled={added || !rate || outgoing.length >= 20}
                              aria-label={t('Exchange {value0}', {
                                value0: item.itemCode,
                              })}
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
                              {added ? t('Added') : t('Add piece')}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {stock.data && stock.data.total > 20 && (
                    <p className="field-hint">
                      {t('Showing 20 matches. Refine your search.')}
                    </p>
                  )}
                  {stock.data?.total === 0 && (
                    <p className="muted">
                      {t('Receive finished pieces in Inventory first.')}
                    </p>
                  )}
                  {outgoing.map((line) => (
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
                          aria-label={t('Remove outgoing {value0}', {
                            value0: line.item.itemCode,
                          })}
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
                          {t('Billed wastage (g)')}
                          <input
                            aria-label={t('Exchange wastage {value0}', {
                              value0: line.item.itemCode,
                            })}
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
                          {t('Making (NPR)')}
                          <input
                            aria-label={t('Exchange making {value0}', {
                              value0: line.item.itemCode,
                            })}
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
                          {t('Stones (NPR)')}
                          <input
                            aria-label={t('Exchange stones {value0}', {
                              value0: line.item.itemCode,
                            })}
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
                      {t('Sale discount (NPR)')}
                      <input
                        required
                        inputMode="decimal"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                      />
                    </label>
                    <label>
                      {t('Tax / fees from official bill (NPR)')}
                      <input
                        required
                        inputMode="decimal"
                        value={tax}
                        onChange={(e) => setTax(e.target.value)}
                      />
                    </label>
                    <label className="full-width">
                      {t('Official sale bill reference (optional)')}
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
                  <h2>{t('Settlement')}</h2>
                  <p>
                    {t(
                      'Leave both amounts at zero to retain the balance on the customer account.',
                    )}
                  </p>
                </div>
                <span className="register-label">04</span>
              </div>
              <div className="sale-form-content form-grid">
                {exchange && (
                  <label>
                    {t('Money received now (NPR)')}
                    <input
                      required
                      inputMode="decimal"
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  {t('Money paid out now (NPR)')}
                  <input
                    required
                    inputMode="decimal"
                    value={payout}
                    onChange={(e) => setPayout(e.target.value)}
                  />
                </label>
                <label>
                  {t('Settlement method')}
                  <select
                    value={method}
                    disabled={
                      Number(payout) <= 0 &&
                      (!exchange || Number(received) <= 0)
                    }
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="CASH">{t('Cash')}</option>
                    <option value="BANK">{t('Bank')}</option>
                    <option value="DIGITAL_WALLET">
                      {t('Digital wallet')}
                    </option>
                  </select>
                </label>
                <label>
                  {t('Payment / payout reference')}
                  <input
                    maxLength={160}
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </label>
                <label>
                  {t('Purchase reference (optional)')}
                  <input
                    maxLength={160}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                <label className="full-width">
                  {t('Notes (optional)')}
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
              'The credit first reduces earlier customer dues. A payout is limited to the remaining credit after any jewellery sale. Record one direction of money movement for this settlement.',
            )}
          </p>
          {error && (
            <p className="error" role="alert">
              {message(error)}
            </p>
          )}
          <div className="sale-page-actions">
            <a className="button secondary" href="#/purchases">
              {t('Back to register')}
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
              {busy ? t('Calculating…') : t('Review settlement')}
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
