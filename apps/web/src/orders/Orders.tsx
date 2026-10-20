import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
import { useState } from 'react';
import { ordersListSchema, ordersSummarySchema } from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { Icon } from '../shared/ui';
import { useDebounced, useResource } from '../shared/useResource';
import { money } from '../customers/format';
import { statusClass, statusTitle } from './format';
import { OrderForm } from './OrderForm';
import { OrderDetails } from './OrderDetails';

export function Orders({ orderId }: { orderId: string | undefined }) {
  if (orderId === 'new') return <OrderForm />;
  if (orderId) return <OrderDetails key={orderId} orderId={orderId} />;
  return <OrderRegister />;
}
function OrderRegister() {
  useLanguage();

  const [search, setSearch] = useState(''),
    term = useDebounced(search);
  const [status, setStatus] = useState('ACTIVE'),
    [overdue, setOverdue] = useState(false),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const query = new URLSearchParams({
    search: term,
    status,
    overdue: String(overdue),
    page: String(page),
    pageSize: '15',
  });
  const list = useResource(`/orders?${query}`, ordersListSchema, revision),
    summary = useResource('/orders/summary', ordersSummarySchema, revision);
  return (
    <AppShell section="Orders">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('orders.list.madeToOrderKeptOnTrack')}</p>
          <h1>
            {t('orders.title')}
            <span>.</span>
          </h1>
          <p className="description">
            {t('orders.list.fromTheFirstDesignToTheFinishedPiece')}
          </p>
        </div>
        <Permission name="orders.write">
          <a className="button primary" href="#/orders/new">
            <Icon name="plus" size={18} />
            {t('common.labels.bookAnOrder')}
          </a>
        </Permission>
      </div>
      <section
        className="summary-cards"
        aria-label={t('orders.list.orderTotals')}
      >
        {[
          {
            label: t('orders.list.activeOrders'),
            value: summary.data?.active,
            note: t('orders.list.bookedInProgressOrReady'),
            icon: 'box',
          },
          {
            label: t('orders.list.readyForDelivery'),
            value: summary.data?.ready,
            note: t('orders.list.completeDeliveryThroughSales'),
            icon: 'diamond',
          },
          {
            label: t('orders.list.overdueOrders'),
            value: summary.data?.overdue,
            note: t('orders.list.deliveryDatePassedNepalTime'),
            icon: 'history',
          },
        ].map((card, index) => (
          <article
            key={card.label}
            className={`summary-card ${index === 1 ? 'gold-card' : ''}`}
          >
            <div className="summary-top">
              <span>{card.label}</span>
              <span className="summary-icon neutral">
                <Icon name={card.icon as 'box' | 'diamond' | 'history'} />
              </span>
            </div>
            <strong>{card.value ?? '—'}</strong>
            <p>{card.note}</p>
          </article>
        ))}
      </section>
      {summary.error && (
        <p className="error" role="alert">
          {message(summary.error)}
        </p>
      )}
      <section className="stock-panel" aria-busy={list.loading}>
        <div className="stock-heading">
          <div>
            <h2>
              {t('orders.list.orderBook') + ' '}
              <span>{list.data?.total ?? '—'}</span>
            </h2>
            <p>
              {t('orders.list.upcomingDeliveryDatesFirstClosedOrdersStayIn')}
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t('common.actions.refresh')}
          </button>
        </div>
        <div className="toolbar orders-toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              aria-label={t('orders.list.searchOrders')}
              placeholder={t('orders.list.searchCodeCustomerPieceOrDesign')}
              maxLength={120}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">{t('orders.list.orderStatus')}</span>
            <select
              aria-label={t('orders.list.orderStatus')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="ACTIVE">{t('orders.list.activeOrders')}</option>
              <option value="ALL">{t('orders.list.allOrders')}</option>
              {Object.entries(statusTitle).map(([key, title]) => (
                <option key={key} value={key}>
                  {t(title)}
                </option>
              ))}
            </select>
          </label>
          <label className="overdue-toggle">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(event) => {
                setOverdue(event.target.checked);
                setPage(1);
              }}
            />
            {t('orders.list.overdueOnly')}
          </label>
        </div>
        {list.loading ? (
          <div className="empty-state" role="status">
            <span className="loading-dot" />
            <p>{t('orders.list.loadingOrders')}</p>
          </div>
        ) : list.error ? (
          <div className="empty-state">
            <h3>{t('orders.list.ordersCouldnTLoad')}</h3>
            <p className="error" role="alert">
              {message(list.error)}
            </p>
            <button
              className="button secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('common.actions.tryAgain')}
            </button>
          </div>
        ) : list.data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('orders.list.orderCustomer')}</th>
                  <th>{t('orders.list.pieces')}</th>
                  <th>{t('orders.list.deliveryDateAd')}</th>
                  <th>{t('common.labels.status')}</th>
                  <th className="numeric">{t('orders.list.estimateNpr')}</th>
                  <th>
                    <span className="sr-only">
                      {t('orders.list.openOrder')}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <a className="item-link" href={`#/orders/${order.id}`}>
                        {order.orderCode}
                      </a>
                      <code>{order.customerSnapshot.name}</code>
                    </td>
                    <td>
                      <strong>{order.lines[0]?.name}</strong>
                      <small className="rate-subline">
                        {order.pieceCount}{' '}
                        {order.pieceCount === 1
                          ? t('common.labels.piece')
                          : t('common.labels.pieces')}{' '}
                        · {order.lines.length} {' ' + t('orders.list.designs')}
                      </small>
                    </td>
                    <td>
                      <span className={order.overdue ? 'danger-text' : ''}>
                        {order.dueDate}
                      </span>
                      {order.overdue && (
                        <small className="rate-subline danger-text">
                          {t('common.labels.overdue')}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={statusClass(order.status)}>
                        {t(statusTitle[order.status])}
                      </span>
                    </td>
                    <td className="numeric">
                      {order.estimatedTotalNpr === null
                        ? t('orders.labels.notSet')
                        : money(order.estimatedTotalNpr)}
                    </td>
                    <td>
                      <a
                        className="icon-button"
                        aria-label={t('common.labels.open', {
                          code: order.orderCode,
                        })}
                        href={`#/orders/${order.id}`}
                      >
                        <Icon name="arrow" size={18} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="diamond" size={30} />
            </span>
            <h3>
              {term || status !== 'ACTIVE' || overdue
                ? t('orders.list.noMatchingOrders')
                : t('orders.list.aNewPieceBeginsWithAPromise')}
            </h3>
            <p>{t('orders.list.bookTheDesignExpectedWeightAndDeliveryDate')}</p>
            <Permission name="orders.write">
              <a className="button secondary" href="#/orders/new">
                {t('common.labels.bookAnOrder')}
              </a>
            </Permission>
          </div>
        )}
        <div className="table-footer">
          <span>
            {list.data?.total ?? '—'}{' '}
            {' ' + t('orders.list.orderRecordsAdDates')}
          </span>
          <div className="pagination">
            <button
              aria-label={t('orders.list.previousOrdersPage')}
              disabled={page === 1 || list.loading}
              onClick={() => setPage((value) => value - 1)}
            >
              ‹
            </button>
            <span>
              {t('common.labels.page') + ' '}
              {page}
            </span>
            <button
              aria-label={t('orders.list.nextOrdersPage')}
              disabled={
                !list.data ||
                page * list.data.pageSize >= list.data.total ||
                list.loading
              }
              onClick={() => setPage((value) => value + 1)}
            >
              ›
            </button>
          </div>
        </div>
      </section>
      <p className="account-scope-note">
        {t('orders.list.expectedWeightsAndEstimatesGuideTheOrderFinal')}
      </p>
    </AppShell>
  );
}
