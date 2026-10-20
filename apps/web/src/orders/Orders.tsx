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
          <p className="eyebrow">MADE TO ORDER, KEPT ON TRACK</p>
          <h1>
            Custom orders<span>.</span>
          </h1>
          <p className="description">
            From the first design to the finished piece, keep every promise in
            view.
          </p>
        </div>
        <Permission name="orders.write">
          <a className="button primary" href="#/orders/new">
            <Icon name="plus" size={18} />
            Book an order
          </a>
        </Permission>
      </div>
      <section className="summary-cards" aria-label="Order totals">
        {[
          {
            label: 'Active orders',
            value: summary.data?.active,
            note: 'Booked, in progress or ready',
            icon: 'box',
          },
          {
            label: 'Ready for delivery',
            value: summary.data?.ready,
            note: 'Complete delivery through Sales',
            icon: 'diamond',
          },
          {
            label: 'Overdue orders',
            value: summary.data?.overdue,
            note: 'Delivery date passed · Nepal time',
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
          {summary.error}
        </p>
      )}
      <section className="stock-panel" aria-busy={list.loading}>
        <div className="stock-heading">
          <div>
            <h2>
              Order book <span>{list.data?.total ?? '—'}</span>
            </h2>
            <p>
              Upcoming delivery dates first. Closed orders stay in the register.
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh
          </button>
        </div>
        <div className="toolbar orders-toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              aria-label="Search orders"
              placeholder="Search code, customer, piece or design…"
              maxLength={120}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">Order status</span>
            <select
              aria-label="Order status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="ACTIVE">Active orders</option>
              <option value="ALL">All orders</option>
              {Object.entries(statusTitle).map(([key, title]) => (
                <option key={key} value={key}>
                  {title}
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
            Overdue only
          </label>
        </div>
        {list.loading ? (
          <div className="empty-state" role="status">
            <span className="loading-dot" />
            <p>Loading orders…</p>
          </div>
        ) : list.error ? (
          <div className="empty-state">
            <h3>Orders couldn’t load</h3>
            <p className="error" role="alert">
              {list.error}
            </p>
            <button
              className="button secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : list.data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order / customer</th>
                  <th>Pieces</th>
                  <th>Delivery date (AD)</th>
                  <th>Status</th>
                  <th className="numeric">Estimate (NPR)</th>
                  <th>
                    <span className="sr-only">Open order</span>
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
                        {order.pieceCount === 1 ? 'piece' : 'pieces'} ·{' '}
                        {order.lines.length} designs
                      </small>
                    </td>
                    <td>
                      <span className={order.overdue ? 'danger-text' : ''}>
                        {order.dueDate}
                      </span>
                      {order.overdue && (
                        <small className="rate-subline danger-text">
                          Overdue
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={statusClass(order.status)}>
                        {statusTitle[order.status]}
                      </span>
                    </td>
                    <td className="numeric">
                      {order.estimatedTotalNpr === null
                        ? 'Not set'
                        : money(order.estimatedTotalNpr)}
                    </td>
                    <td>
                      <a
                        className="icon-button"
                        aria-label={`Open ${order.orderCode}`}
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
                ? 'No matching orders'
                : 'A new piece begins with a promise'}
            </h3>
            <p>
              Book the design, expected weight and delivery date for your
              customer.
            </p>
            <Permission name="orders.write">
              <a className="button secondary" href="#/orders/new">
                Book an order
              </a>
            </Permission>
          </div>
        )}
        <div className="table-footer">
          <span>{list.data?.total ?? '—'} order records · AD dates</span>
          <div className="pagination">
            <button
              aria-label="Previous orders page"
              disabled={page === 1 || list.loading}
              onClick={() => setPage((value) => value - 1)}
            >
              ‹
            </button>
            <span>Page {page}</span>
            <button
              aria-label="Next orders page"
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
        Expected weights and estimates guide the order. Final pricing and stock
        movement are recorded when the finished pieces are delivered through
        Sales.
      </p>
    </AppShell>
  );
}
