import { t, message, useLanguage } from '../i18n/language';
import { useState, type FormEvent } from 'react';
import {
  createOrderSchema,
  customerListSchema,
  nepalToday,
  orderDetailSchema,
  type Customer,
} from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { request, errorMessage } from '../shared/api';
import { useDebounced, useResource } from '../shared/useResource';
import { Icon } from '../shared/ui';
import { balance } from '../customers/format';

const blankLine = () => ({
  key: globalThis.crypto.randomUUID(),
  name: '',
  design: '',
  size: '',
  metal: 'GOLD' as 'GOLD' | 'SILVER',
  fineness: '916.667',
  quantity: 1,
  expectedNetWeightGrams: '',
  plannedWastageGrams: '0',
  plannedMakingNpr: '0',
  plannedStonesNpr: '0',
});
export function OrderForm() {
  useLanguage();

  const [requestId] = useState(() => globalThis.crypto.randomUUID());
  const [search, setSearch] = useState(''),
    term = useDebounced(search),
    [customer, setCustomer] = useState<Customer | null>(null);
  const customers = useResource(
    `/customers?search=${encodeURIComponent(term)}&pageSize=20`,
    customerListSchema,
  );
  const [orderDate, setOrderDate] = useState(() => nepalToday()),
    [dueDate, setDueDate] = useState(() => nepalToday());
  const [lines, setLines] = useState(() => [blankLine()]),
    [estimate, setEstimate] = useState(''),
    [notes, setNotes] = useState('');
  const [deposit, setDeposit] = useState('0'),
    [method, setMethod] = useState('CASH'),
    [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  function changeLine(
    key: string,
    fields: Partial<ReturnType<typeof blankLine>>,
  ) {
    setLines((lines) =>
      lines.map((line) => (line.key === key ? { ...line, ...fields } : line)),
    );
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed = createOrderSchema.safeParse({
      requestId,
      customerId: customer?.id,
      orderDate,
      dueDate,
      lines: lines.map(({ key, ...line }) => {
        void key;
        return line;
      }),
      estimatedTotalNpr: estimate || null,
      notes,
      deposit: {
        amountNpr: deposit,
        method: Number(deposit) > 0 ? method : null,
        reference,
      },
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('\n'),
      );
      return;
    }
    setBusy(true);
    try {
      const detail = await request('/orders', orderDetailSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      globalThis.location.hash = `/orders/${detail.order.id}`;
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  const account = customer ? balance(customer.balanceNpr) : null;
  return (
    <AppShell section="Orders">
      <a className="back-link" href="#/orders">
        {t('orders.labels.orderBook')}
      </a>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {t('orders.orderForm.customJewelleryBooking')}
          </p>
          <h1>
            {t('common.labels.bookAnOrder')}
            <span>.</span>
          </h1>
          <p className="description">{t('orders.orderForm.description')}</p>
        </div>
        <span className="manual-badge">{t('orders.orderForm.newOrder')}</span>
      </div>
      <form onSubmit={(event) => void create(event)}>
        <fieldset disabled={busy} className="sale-builder-fields">
          <section className="stock-panel">
            <div className="stock-heading">
              <div>
                <h2>{t('orders.orderForm.customerDelivery')}</h2>
                <p>
                  {t('orders.orderForm.searchExistingCustomersBeforeBooking')}
                </p>
              </div>
              <span className="register-label">01</span>
            </div>
            <div className="sale-form-content">
              <div className="form-grid order-dates">
                <label>
                  {t('orders.orderForm.orderDateAd')}
                  <input
                    required
                    type="date"
                    min={customer?.openedOn || '2000-01-01'}
                    max={nepalToday()}
                    value={orderDate}
                    onChange={(event) => setOrderDate(event.target.value)}
                  />
                </label>
                <label>
                  {t('orders.orderForm.promisedDeliveryDateAd')}
                  <input
                    required
                    type="date"
                    min={orderDate}
                    max="2099-12-31"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
              </div>
              {customer && account ? (
                <div className="selected-customer">
                  <div>
                    <strong>{customer.name}</strong>
                    <small>
                      {customer.customerCode} · {t(account.label)}
                      {t('common.labels.npr')} {account.amount}
                    </small>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setCustomer(null)}
                  >
                    {t('common.labels.changeCustomer')}
                  </button>
                </div>
              ) : (
                <>
                  <label className="search">
                    <Icon name="search" size={18} />
                    <input
                      aria-label={t('orders.orderForm.findOrderCustomer')}
                      placeholder={t(
                        'common.labels.searchCustomerNamePhoneOrCode',
                      )}
                      maxLength={120}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
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
                          key={item.id}
                          type="button"
                          className="sale-picker-row"
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
                </>
              )}
            </div>
          </section>
          <section className="stock-panel">
            <div className="stock-heading">
              <div>
                <h2>{t('orders.orderForm.designsSpecifications')}</h2>
                <p>
                  {t(
                    'orders.orderForm.expectedNetMetalWeightIsPerPieceExcluding',
                  )}
                </p>
              </div>
              <span className="register-label">02</span>
            </div>
            <div className="sale-form-content">
              {lines.map((line, index) => (
                <article className="order-spec-editor" key={line.key}>
                  <div className="sale-line-heading">
                    <strong>
                      {t('orders.orderForm.design') + ' '}
                      {index + 1}
                    </strong>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('orders.orderForm.removeDesign', {
                        position: index + 1,
                      })}
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines(lines.filter((item) => item.key !== line.key))
                      }
                    >
                      <Icon name="close" size={17} />
                    </button>
                  </div>
                  <div className="form-grid">
                    <label>
                      {t('orders.orderForm.pieceName')}
                      <input
                        aria-label={t('orders.orderForm.pieceName2', {
                          position: index + 1,
                        })}
                        required
                        maxLength={120}
                        value={line.name}
                        onChange={(event) =>
                          changeLine(line.key, { name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t('orders.orderForm.sizeMeasurementOptional')}
                      <input
                        aria-label={t('orders.orderForm.size', {
                          position: index + 1,
                        })}
                        maxLength={120}
                        placeholder={t(
                          'orders.orderForm.eGRingSize16Chain18Inches',
                        )}
                        value={line.size}
                        onChange={(event) =>
                          changeLine(line.key, { size: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t('common.labels.metal')}
                      <select
                        aria-label={t('orders.orderForm.metal', {
                          position: index + 1,
                        })}
                        value={line.metal}
                        onChange={(event) =>
                          changeLine(line.key, {
                            metal: event.target.value as 'GOLD' | 'SILVER',
                            fineness:
                              event.target.value === 'GOLD' ? '916.667' : '925',
                          })
                        }
                      >
                        <option value="GOLD">{t('common.metals.gold')}</option>
                        <option value="SILVER">
                          {t('common.metals.silver')}
                        </option>
                      </select>
                    </label>
                    <label>
                      {t('orders.orderForm.purity')}
                      <input
                        aria-label={t('orders.orderForm.purity2', {
                          position: index + 1,
                        })}
                        required
                        inputMode="decimal"
                        value={line.fineness}
                        onChange={(event) =>
                          changeLine(line.key, { fineness: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t('common.fields.quantity')}
                      <input
                        aria-label={t('orders.orderForm.quantity', {
                          position: index + 1,
                        })}
                        type="number"
                        min="1"
                        max="20"
                        step="1"
                        required
                        value={line.quantity}
                        onChange={(event) =>
                          changeLine(line.key, {
                            quantity: event.target.valueAsNumber,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t('orders.orderForm.expectedNetWeightPieceG')}
                      <input
                        aria-label={t('orders.orderForm.expectedNetWeight', {
                          position: index + 1,
                        })}
                        required
                        inputMode="decimal"
                        value={line.expectedNetWeightGrams}
                        onChange={(event) =>
                          changeLine(line.key, {
                            expectedNetWeightGrams: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t('orders.orderForm.plannedBilledWastagePieceG')}
                      <input
                        aria-label={t('orders.orderForm.plannedWastage', {
                          position: index + 1,
                        })}
                        inputMode="decimal"
                        required
                        value={line.plannedWastageGrams}
                        onChange={(event) =>
                          changeLine(line.key, {
                            plannedWastageGrams: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t('orders.orderForm.plannedMakingPieceNpr')}
                      <input
                        aria-label={t('orders.orderForm.plannedMaking', {
                          position: index + 1,
                        })}
                        inputMode="decimal"
                        required
                        value={line.plannedMakingNpr}
                        onChange={(event) =>
                          changeLine(line.key, {
                            plannedMakingNpr: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t('orders.orderForm.plannedStonesPieceNpr')}
                      <input
                        aria-label={t('orders.orderForm.plannedStones', {
                          position: index + 1,
                        })}
                        inputMode="decimal"
                        required
                        value={line.plannedStonesNpr}
                        onChange={(event) =>
                          changeLine(line.key, {
                            plannedStonesNpr: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="full-width">
                      {t('orders.orderForm.designDetailsReference')}
                      <textarea
                        aria-label={t('orders.orderForm.designDetails', {
                          position: index + 1,
                        })}
                        required
                        rows={2}
                        maxLength={500}
                        placeholder={t(
                          'orders.orderForm.patternFinishStoneSettingOrADesignReference',
                        )}
                        value={line.design}
                        onChange={(event) =>
                          changeLine(line.key, { design: event.target.value })
                        }
                      />
                    </label>
                  </div>
                </article>
              ))}
              <button
                type="button"
                className="button secondary"
                disabled={lines.length >= 20}
                onClick={() => setLines([...lines, blankLine()])}
              >
                <Icon name="plus" size={16} />
                {t('orders.orderForm.addAnotherDesign')}
              </button>
            </div>
          </section>
          <section className="stock-panel">
            <div className="stock-heading">
              <div>
                <h2>{t('orders.orderForm.estimateAdvance')}</h2>
                <p>
                  {t('orders.orderForm.theEstimateIsAGuideActualWeightsAnd')}
                </p>
              </div>
              <span className="register-label">03</span>
            </div>
            <div className="sale-form-content form-grid">
              <label>
                {t('orders.orderForm.estimatedTotalNprOptional')}
                <input
                  inputMode="decimal"
                  value={estimate}
                  onChange={(event) => setEstimate(event.target.value)}
                />
              </label>
              <label>
                {t('orders.orderForm.advanceReceivedNowNpr')}
                <input
                  required
                  inputMode="decimal"
                  value={deposit}
                  onChange={(event) => setDeposit(event.target.value)}
                />
              </label>
              <label>
                {t('common.labels.paymentMethod')}
                <select
                  disabled={Number(deposit) <= 0}
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
              <label>
                {t('common.labels.paymentReferenceOptional')}
                <input
                  maxLength={160}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </label>
              <label className="full-width">
                {t('orders.orderForm.orderNotesOptional')}
                <textarea
                  maxLength={1000}
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </div>
          </section>
        </fieldset>
        <p className="account-scope-note">
          {t('orders.orderForm.theAdvanceCreditsTheCustomerSOverallAccount')}
        </p>
        {error && (
          <p className="error" role="alert">
            {message(error)}
          </p>
        )}
        <div className="sale-page-actions">
          <a href="#/orders" className="button secondary">
            {t('orders.orderForm.backToOrderBook')}
          </a>
          <button className="button primary" disabled={busy || !customer}>
            {busy
              ? t('orders.orderForm.booking')
              : t('orders.orderForm.bookOrder')}
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </form>
    </AppShell>
  );
}
