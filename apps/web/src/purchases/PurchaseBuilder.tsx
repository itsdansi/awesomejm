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
          .join(' '),
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
          ← Back to order
        </a>
        <div className="empty-state">
          <h2>
            {order.loading
              ? 'Loading order…'
              : 'The order must be Ready before delivery'}
          </h2>
          {order.error && (
            <p className="error" role="alert">
              {order.error}
            </p>
          )}
        </div>
      </AppShell>
    );
  return (
    <AppShell section="Purchases">
      <a className="back-link" href="#/purchases">
        ← Purchase register
      </a>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WEIGH · VALUE · SETTLE</p>
          <h1>
            {review ? 'Review settlement' : 'Buy or exchange metal'}
            <span>.</span>
          </h1>
          <p className="description">
            {review
              ? 'Check incoming metal, outgoing pieces and the complete account effect.'
              : 'Record the assessed metal and the amount agreed with the customer.'}
          </p>
        </div>
        <span className="manual-badge">
          {review ? '02 / REVIEW' : '01 / DETAILS'}
        </span>
      </div>
      {order.data && (
        <div className="order-delivery-banner">
          Delivering{' '}
          <a href={`#/orders/${orderId}`}>{order.data.order.orderCode}</a>.
          Select all {order.data.order.pieceCount} ordered pieces. Check design
          and size against the order before posting.
        </div>
      )}
      {review ? (
        <>
          <section className="stock-panel">
            <div className="stock-heading">
              <div>
                <h2>{review.quote.customer.name}</h2>
                <p>
                  {date} AD · {exchange ? 'Exchange' : 'Old-metal purchase'} ·
                  NPR
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
              Purchase reference: {reference || 'Not entered'} · Method:{' '}
              {Number(payout) > 0 || Number(received) > 0
                ? method.replaceAll('_', ' ')
                : 'Account credit only'}
            </p>
          </section>
          <p className="account-scope-note">
            Posting receives the complete physical net metal into old-metal lots
            and records the credit, optional jewellery sale and settlement
            together. This internal record does not issue an official invoice.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
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
              Back to details
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void post()}
            >
              {busy ? 'Posting…' : 'Post settlement'}
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
                  <h2>Customer & date</h2>
                  <p>The purchase credits this customer’s existing account.</p>
                </div>
                <span className="register-label">01</span>
              </div>
              <div className="sale-form-content">
                <label className="date-filter">
                  Purchase / exchange date (AD)
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
                        {customer.customerCode} · {account.label}: NPR{' '}
                        {account.amount}
                      </small>
                    </div>
                    {!orderId && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setPicked(null)}
                      >
                        Change customer
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <label className="search">
                      <Icon name="search" size={18} />
                      <input
                        aria-label="Find purchase customer"
                        placeholder="Search customer name, phone or code…"
                        maxLength={120}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <div className="sale-picker-list">
                      {customers.loading ? (
                        <p className="muted">Loading customers…</p>
                      ) : customers.error ? (
                        <p className="error" role="alert">
                          {customers.error}
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
                                {item.customerCode} · {item.phone || 'No phone'}
                              </small>
                            </span>
                            <Icon name="arrow" size={17} />
                          </button>
                        ))
                      ) : (
                        <p className="muted">
                          No matching customer.{' '}
                          <a href="#/customers">Add the customer first.</a>
                        </p>
                      )}
                    </div>
                    {customers.data && customers.data.total > 20 && (
                      <p className="field-hint">
                        Showing 20 matches. Refine your search.
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>Incoming old metal</h2>
                  <p>
                    Enter physical measurements and the assessed purity. The
                    buying quote already applies to that purity.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setRevision((v) => v + 1)}
                >
                  Refresh rates
                </button>
              </div>
              <div className="sale-form-content">
                {rates.error && (
                  <p className="error" role="alert">
                    {rates.error}
                  </p>
                )}
                {lines.map((line, index) => {
                  const rate = match(line.metal, line.fineness);
                  return (
                    <article className="order-spec-editor" key={line.key}>
                      <div className="sale-line-heading">
                        <strong>Incoming lot {index + 1}</strong>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Remove incoming lot ${index + 1}`}
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
                          Description
                          <input
                            aria-label={`Incoming description ${index + 1}`}
                            required
                            maxLength={120}
                            value={line.name}
                            onChange={(e) =>
                              lineChange(line.key, { name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Metal
                          <select
                            aria-label={`Incoming metal ${index + 1}`}
                            value={line.metal}
                            onChange={(e) =>
                              lineChange(line.key, {
                                metal: e.target.value as 'GOLD' | 'SILVER',
                                fineness:
                                  e.target.value === 'GOLD' ? '916.667' : '925',
                              })
                            }
                          >
                            <option value="GOLD">Gold</option>
                            <option value="SILVER">Silver</option>
                          </select>
                        </label>
                        <label>
                          Assessed purity (‰)
                          <input
                            aria-label={`Incoming purity ${index + 1}`}
                            required
                            inputMode="decimal"
                            value={line.fineness}
                            onChange={(e) =>
                              lineChange(line.key, { fineness: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Gross weight (g)
                          <input
                            aria-label={`Incoming gross weight ${index + 1}`}
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
                          Stone / other weight (g)
                          <input
                            aria-label={`Incoming stone weight ${index + 1}`}
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
                          Agreed weight deduction (g)
                          <input
                            aria-label={`Incoming weight deduction ${index + 1}`}
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
                          Other deduction (NPR)
                          <input
                            aria-label={`Incoming money deduction ${index + 1}`}
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
                          Deduction reason
                          <input
                            aria-label={`Deduction reason ${index + 1}`}
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
                          Assay method / assessment notes
                          <textarea
                            aria-label={`Assay notes ${index + 1}`}
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
                          ? 'Loading quote…'
                          : rate
                            ? `Buying quote: NPR ${money(rate.buyRatePerTola)} / tola · ${rate.gramsPerTola} g/tola`
                            : 'No matching buying quote on this date. Set the exact purity in Metal rates first.'}
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
                  Add incoming lot
                </button>
                <p className="field-hint">
                  Deductions reduce payable value. They do not remove physical
                  net metal from the received lot.
                </p>
              </div>
            </section>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>Exchange for jewellery</h2>
                  <p>
                    Select available pieces when supplying new jewellery against
                    this purchase.
                  </p>
                </div>
                <label className="overdue-toggle">
                  <input
                    type="checkbox"
                    checked={exchange}
                    disabled={orderId !== null}
                    onChange={(e) => setExchange(e.target.checked)}
                  />
                  Include jewellery sale
                </label>
              </div>
              {exchange && (
                <div className="sale-form-content">
                  <label className="search">
                    <Icon name="search" size={18} />
                    <input
                      aria-label="Find exchange stock"
                      placeholder="Search available pieces…"
                      maxLength={120}
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                    />
                  </label>
                  <div className="sale-picker-list">
                    {stock.loading ? (
                      <p className="muted">Loading stock…</p>
                    ) : stock.error ? (
                      <p className="error" role="alert">
                        {stock.error}
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
                                {item.netWeightGrams} g
                              </small>
                              <small>
                                {rate
                                  ? `Selling quote NPR ${money(rate.sellRatePerTola)} / tola`
                                  : 'Set a matching selling quote first.'}
                              </small>
                            </span>
                            <button
                              type="button"
                              className="button secondary compact"
                              disabled={added || !rate || outgoing.length >= 20}
                              aria-label={`Exchange ${item.itemCode}`}
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
                              {added ? 'Added' : 'Add piece'}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {stock.data && stock.data.total > 20 && (
                    <p className="field-hint">
                      Showing 20 matches. Refine your search.
                    </p>
                  )}
                  {stock.data?.total === 0 && (
                    <p className="muted">
                      Receive finished pieces in Inventory first.
                    </p>
                  )}
                  {outgoing.map((line) => (
                    <article className="sale-selected-line" key={line.item.id}>
                      <div className="sale-line-heading">
                        <div>
                          <strong>{line.item.name}</strong>
                          <small>
                            {line.item.itemCode} · {line.item.netWeightGrams} g
                            net
                          </small>
                        </div>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Remove outgoing ${line.item.itemCode}`}
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
                          Billed wastage (g)
                          <input
                            aria-label={`Exchange wastage ${line.item.itemCode}`}
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
                          Making (NPR)
                          <input
                            aria-label={`Exchange making ${line.item.itemCode}`}
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
                          Stones (NPR)
                          <input
                            aria-label={`Exchange stones ${line.item.itemCode}`}
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
                      Sale discount (NPR)
                      <input
                        required
                        inputMode="decimal"
                        value={discount}
                        onChange={(e) => setDiscount(e.target.value)}
                      />
                    </label>
                    <label>
                      Tax / fees from official bill (NPR)
                      <input
                        required
                        inputMode="decimal"
                        value={tax}
                        onChange={(e) => setTax(e.target.value)}
                      />
                    </label>
                    <label className="full-width">
                      Official sale bill reference (optional)
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
                  <h2>Settlement</h2>
                  <p>
                    Leave both amounts at zero to retain the balance on the
                    customer account.
                  </p>
                </div>
                <span className="register-label">04</span>
              </div>
              <div className="sale-form-content form-grid">
                {exchange && (
                  <label>
                    Money received now (NPR)
                    <input
                      required
                      inputMode="decimal"
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  Money paid out now (NPR)
                  <input
                    required
                    inputMode="decimal"
                    value={payout}
                    onChange={(e) => setPayout(e.target.value)}
                  />
                </label>
                <label>
                  Settlement method
                  <select
                    value={method}
                    disabled={
                      Number(payout) <= 0 &&
                      (!exchange || Number(received) <= 0)
                    }
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank</option>
                    <option value="DIGITAL_WALLET">Digital wallet</option>
                  </select>
                </label>
                <label>
                  Payment / payout reference
                  <input
                    maxLength={160}
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </label>
                <label>
                  Purchase reference (optional)
                  <input
                    maxLength={160}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                <label className="full-width">
                  Notes (optional)
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
            The credit first reduces earlier customer dues. A payout is limited
            to the remaining credit after any jewellery sale. Record one
            direction of money movement for this settlement.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="sale-page-actions">
            <a className="button secondary" href="#/purchases">
              Back to register
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
              {busy ? 'Calculating…' : 'Review settlement'}
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </form>
      )}
    </AppShell>
  );
}
