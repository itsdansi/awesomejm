import { Permission } from '../auth/Permission';
import { useState } from 'react';
import { dashboardSchema } from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { Icon } from '../shared/ui';
import { useResource } from '../shared/useResource';
import { money } from '../customers/format';
import { ActivityCards } from '../reports/ReportParts';
export function Dashboard() {
  const [revision, setRevision] = useState(0),
    result = useResource('/dashboard', dashboardSchema, revision),
    data = result.data;
  return (
    <AppShell section="Dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR SHOP, AT A GLANCE</p>
          <h1>
            Shop overview<span>.</span>
          </h1>
          <p className="description">
            {data
              ? `${data.date} AD · Nepal time`
              : 'Today’s trade, stock and customer balances.'}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          Refresh overview
        </button>
      </div>
      <div className="dashboard-quick-actions">
        <Permission name="sales.write">
          <a className="button primary" href="#/sales/new">
            <Icon name="plus" size={17} />
            Record a sale
          </a>
        </Permission>
        <Permission name="purchases.write">
          <a className="button secondary" href="#/purchases/new">
            Buy / exchange metal
            <Icon name="arrow" size={17} />
          </a>
        </Permission>
        <Permission name="orders.write">
          <a className="button secondary" href="#/orders/new">
            Book an order
            <Icon name="arrow" size={17} />
          </a>
        </Permission>
        <a className="text-button" href="#/reports">
          Open reports →
        </a>
      </div>
      {result.loading ? (
        <div className="empty-state" role="status">
          Loading shop overview…
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>The overview couldn’t load</h2>
          <p className="error" role="alert">
            {result.error}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            Try again
          </button>
        </div>
      ) : (
        data && (
          <>
            {(data.missingRates > 0 || data.orders.overdue > 0) && (
              <div className="dashboard-alerts">
                {data.missingRates > 0 && (
                  <a href="#/rates">
                    <Icon name="diamond" size={17} />
                    {data.missingRates} stock metal/purity combinations need
                    today’s rate →
                  </a>
                )}
                {data.orders.overdue > 0 && (
                  <a href="#/orders">
                    <Icon name="history" size={17} />
                    {data.orders.overdue} orders are past their promised date →
                  </a>
                )}
              </div>
            )}
            <div className="section-caption">
              <h2>Today’s activity</h2>
              <span>Net of corrections recorded today</span>
            </div>
            <ActivityCards totals={data.today} />
            <section className="dashboard-month stock-panel">
              <div>
                <p className="eyebrow">MONTH TO DATE</p>
                <h2>{data.date.slice(0, 7)}</h2>
              </div>
              <div>
                <small>Net sales</small>
                <strong>NPR {money(data.month.netSalesNpr)}</strong>
              </div>
              <div>
                <small>Net purchases</small>
                <strong>NPR {money(data.month.netPurchasesNpr)}</strong>
              </div>
              <div>
                <small>Net money movement</small>
                <strong>NPR {money(data.month.netCashNpr)}</strong>
              </div>
            </section>
            <div className="dashboard-grid">
              <section className="stock-panel">
                <div className="stock-heading">
                  <div>
                    <h2>Available metal</h2>
                    <p>Physical net weight held, grouped by purity.</p>
                  </div>
                  <a className="text-button" href="#/reports">
                    Reconciliation →
                  </a>
                </div>
                {data.stock.some((row) => row.closingCount > 0) ? (
                  <div className="dashboard-stock-list">
                    {data.stock
                      .filter((row) => row.closingCount > 0)
                      .map((row) => (
                        <div
                          key={`${row.stockClass}:${row.metal}:${row.fineness}`}
                        >
                          <span
                            className={`summary-icon ${row.metal === 'GOLD' ? 'gold' : 'neutral'}`}
                          >
                            <Icon name="diamond" size={20} />
                          </span>
                          <div>
                            <strong>
                              {row.metal === 'GOLD' ? 'Gold' : 'Silver'} ·{' '}
                              {row.fineness}‰
                            </strong>
                            <small>
                              {row.stockClass === 'JEWELLERY'
                                ? 'Ready-made jewellery'
                                : 'Old-metal lots'}{' '}
                              · {row.closingCount} pieces/lots
                            </small>
                          </div>
                          <span className="dashboard-weight">
                            <strong>
                              {row.closingGrams} <small>g</small>
                            </strong>
                            <small>Fine {row.closingFineGrams} g</small>
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <h3>No metal in stock yet</h3>
                    <p>Receive jewellery or record an old-metal purchase.</p>
                  </div>
                )}
              </section>
              <div className="dashboard-right">
                <section className="stock-panel dashboard-accounts">
                  <p className="eyebrow">CUSTOMER ACCOUNTS</p>
                  <dl>
                    <div>
                      <dt>Customer dues</dt>
                      <dd className="due">
                        NPR {money(data.accounts.duesNpr)}
                      </dd>
                    </div>
                    <div>
                      <dt>Advances / credit held</dt>
                      <dd className="advance">
                        NPR {money(data.accounts.advancesNpr)}
                      </dd>
                    </div>
                  </dl>
                  <a className="text-button" href="#/customers">
                    View customer accounts →
                  </a>
                </section>
                <section className="stock-panel dashboard-orders">
                  <div className="stock-heading">
                    <div>
                      <h2>Order desk</h2>
                      <p>Track the promises still in progress.</p>
                    </div>
                  </div>
                  <div className="dashboard-order-counts">
                    <div>
                      <strong>{data.orders.active}</strong>
                      <small>Active</small>
                    </div>
                    <div>
                      <strong>{data.orders.ready}</strong>
                      <small>Ready</small>
                    </div>
                    <div>
                      <strong
                        className={data.orders.overdue ? 'danger-text' : ''}
                      >
                        {data.orders.overdue}
                      </strong>
                      <small>Overdue</small>
                    </div>
                  </div>
                  <a className="text-button" href="#/orders">
                    Open order book →
                  </a>
                </section>
              </div>
            </div>
            <section className="stock-panel dashboard-recent">
              <div className="stock-heading">
                <div>
                  <h2>Recent trade records</h2>
                  <p>
                    Sales and old-metal purchases. Exchanges appear as their
                    linked purchase and sale.
                  </p>
                </div>
              </div>
              {data.recent.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Record / date (AD)</th>
                        <th>Customer at posting</th>
                        <th>Type</th>
                        <th className="numeric">Value (NPR)</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((row) => (
                        <tr key={`${row.kind}:${row.id}`}>
                          <td>
                            <a
                              className="item-link"
                              href={`#/${row.kind === 'SALE' ? 'sales' : 'purchases'}/${row.id}`}
                            >
                              {row.code}
                            </a>
                            <code>{row.date}</code>
                          </td>
                          <td>{row.customerName}</td>
                          <td>
                            {row.kind === 'SALE'
                              ? 'Sale'
                              : 'Old-metal purchase'}
                          </td>
                          <td className="numeric">
                            <strong>{money(row.totalNpr)}</strong>
                          </td>
                          <td>
                            <span
                              className={`status ${row.cancelled ? 'voided' : ''}`}
                            >
                              {row.cancelled ? 'Cancelled' : 'Posted'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <h3>Your next transaction will appear here</h3>
                  <p>Start with a customer, stock and today’s metal rates.</p>
                </div>
              )}
            </section>
            <p className="account-scope-note">
              Money movement is recorded receipts minus payouts, including
              corrections. Sales value is not profit or cash received. Old-metal
              lots remain separate from ready-made jewellery.
            </p>
          </>
        )
      )}
    </AppShell>
  );
}
