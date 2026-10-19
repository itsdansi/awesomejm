import { useState } from 'react';
import {
  nepalToday,
  salesListSchema,
  salesSummarySchema,
} from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { Icon } from '../shared/ui';
import { useDebounced, useResource } from '../shared/useResource';
import { money } from '../customers/format';
import { SaleBuilder } from './SaleBuilder';
import { SaleDetails } from './SaleDetails';

export function Sales({ saleId }: { saleId: string | undefined }) {
  if (saleId === 'new') return <SaleBuilder />;
  if (saleId) return <SaleDetails key={saleId} saleId={saleId} />;
  return <SalesRegister />;
}
function SalesRegister() {
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [status, setStatus] = useState('ALL');
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const query = new URLSearchParams({
    search: term,
    status,
    page: String(page),
    pageSize: '15',
  });
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const list = useResource(`/sales?${query}`, salesListSchema, revision);
  const summary = useResource('/sales/summary', salesSummarySchema, revision);
  return (
    <AppShell section="Sales">
      <div className="page-heading">
        <div>
          <p className="eyebrow">FROM YOUR COUNTER TO THEIR COLLECTION</p>
          <h1>
            Sales register<span>.</span>
          </h1>
          <p className="description">
            Every piece sold, every charge and payment recorded together.
          </p>
        </div>
        <a className="button primary" href="#/sales/new">
          <Icon name="plus" size={18} />
          Record a sale
        </a>
      </div>
      <section className="summary-cards" aria-label="All-time sales totals">
        <article className="summary-card">
          <div className="summary-top">
            <span>Posted sales</span>
            <span className="summary-icon neutral">
              <Icon name="receipt" />
            </span>
          </div>
          <strong>{summary.data?.posted ?? '—'}</strong>
          <p>All time · excludes cancelled records</p>
        </article>
        <article className="summary-card gold-card">
          <div className="summary-top">
            <span>Recorded sale value</span>
            <span className="summary-icon gold">रु</span>
          </div>
          <strong className="customer-money">
            {summary.data ? money(summary.data.postedTotalNpr) : '—'}
            <small>NPR</small>
          </strong>
          <p>All time · includes recorded tax / fees</p>
        </article>
        <article className="summary-card">
          <div className="summary-top">
            <span>Cancelled records</span>
            <span className="summary-icon neutral">
              <Icon name="history" />
            </span>
          </div>
          <strong>{summary.data?.cancelled ?? '—'}</strong>
          <p>Corrections retained for your records</p>
        </article>
      </section>
      {summary.error && (
        <p className="error" role="alert">
          Totals: {summary.error}
        </p>
      )}
      <p className="account-scope-note">
        Internal sales records. Issue official invoices through the shop’s
        billing process. Customer balances include all recorded sales and
        account entries.
      </p>
      <section className="stock-panel" aria-busy={list.loading}>
        <div className="stock-heading">
          <div>
            <h2>
              Recorded sales <span>{list.data?.total ?? '—'}</span>
            </h2>
            <p>
              Search by sale code, customer name or official bill reference.
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh
          </button>
        </div>
        <div className="toolbar sales-toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              aria-label="Search sales"
              placeholder="Search sales or customers…"
              value={search}
              maxLength={120}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">Sale status</span>
            <select
              aria-label="Sale status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All records</option>
              <option value="POSTED">Posted</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label className="date-filter">
            From (AD)
            <input
              type="date"
              value={from}
              max={to || nepalToday()}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="date-filter">
            To (AD)
            <input
              type="date"
              value={to}
              min={from}
              max={nepalToday()}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        {list.loading ? (
          <div className="empty-state" role="status">
            <span className="loading-dot" />
            <p>Loading sales…</p>
          </div>
        ) : list.error ? (
          <div className="empty-state">
            <h3>Sales couldn’t load</h3>
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
                  <th>Sale / date (AD)</th>
                  <th>Customer at posting</th>
                  <th>Status</th>
                  <th className="numeric">Sale total (NPR)</th>
                  <th className="numeric">Received at posting</th>
                  <th>
                    <span className="sr-only">Open sale</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <a className="item-link" href={`#/sales/${sale.id}`}>
                        {sale.saleCode}
                      </a>
                      <code>{sale.saleDate}</code>
                    </td>
                    <td>
                      <strong>{sale.customerSnapshot.name}</strong>
                      <code>
                        {sale.billReference ||
                          sale.customerSnapshot.customerCode}
                      </code>
                    </td>
                    <td>
                      <span
                        className={`status ${sale.status === 'POSTED' ? '' : 'voided'}`}
                      >
                        {sale.status === 'POSTED' ? 'Posted' : 'Cancelled'}
                      </span>
                    </td>
                    <td className="numeric">
                      <strong>{money(sale.totalNpr)}</strong>
                    </td>
                    <td className="numeric">{money(sale.paymentNpr)}</td>
                    <td>
                      <a
                        className="icon-button"
                        aria-label={`Open ${sale.saleCode}`}
                        href={`#/sales/${sale.id}`}
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
              <Icon name="receipt" size={30} />
            </span>
            <h3>
              {term || from || to || status !== 'ALL'
                ? 'No matching sales'
                : 'Ready for your first sale'}
            </h3>
            <p>Choose an available piece and a customer to record a sale.</p>
            <a className="button secondary" href="#/sales/new">
              Record a sale
            </a>
          </div>
        )}
        <div className="table-footer">
          <span>
            {list.data ? `${list.data.total} sale records` : 'Sales register'} ·
            AD dates
          </span>
          <div className="pagination">
            <button
              aria-label="Previous sales page"
              disabled={page === 1 || list.loading}
              onClick={() => setPage((value) => value - 1)}
            >
              ‹
            </button>
            <span>Page {page}</span>
            <button
              aria-label="Next sales page"
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
    </AppShell>
  );
}
