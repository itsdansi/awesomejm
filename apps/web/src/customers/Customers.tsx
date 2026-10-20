import { useEffect, useState } from 'react';
import {
  customerListSchema,
  customerSummarySchema,
  type CustomerList,
  type CustomerSummary,
} from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { Icon } from '../shared/ui';
import { request, errorMessage } from '../shared/api';
import { CustomerForm } from './CustomerForm';
import { CustomerAccount } from './CustomerAccount';
import { balance, money } from './format';

export function Customers({ customerId }: { customerId: string | undefined }) {
  return customerId ? (
    <CustomerAccount key={customerId} customerId={customerId} />
  ) : (
    <CustomerRegister />
  );
}
function CustomerRegister() {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{
    key: string;
    data: { list: CustomerList; summary: CustomerSummary } | null;
    error: string;
  } | null>(null);
  const key = JSON.stringify([term, filter, page, revision]);
  const loading = result?.key !== key;
  const data = loading ? null : result?.data;
  const error = loading ? '' : result?.error;
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      search: term,
      balance: filter,
      page: String(page),
      pageSize: '15',
    });
    void Promise.all([
      request(`/customers?${query}`, customerListSchema, {
        signal: controller.signal,
      }),
      request('/customers/summary', customerSummarySchema, {
        signal: controller.signal,
      }),
    ])
      .then(([list, summary]) => {
        if (!controller.signal.aborted)
          setResult({ key, data: { list, summary }, error: '' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, data: null, error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [term, filter, page, key]);
  return (
    <AppShell section="Customers">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVERY RELATIONSHIP, EVERY BALANCE</p>
          <h1>
            Customer accounts<span>.</span>
          </h1>
          <p className="description">
            Keep customer details, dues and advances in one place.
          </p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={18} />
          Add a customer
        </button>
      </div>
      <section className="summary-cards" aria-label="Customer account totals">
        <article className="summary-card">
          <div className="summary-top">
            <span>Customers</span>
            <span className="summary-icon neutral">
              <Icon name="users" />
            </span>
          </div>
          <strong>{data?.summary.customers ?? '—'}</strong>
          <p>Customer records in your shop</p>
        </article>
        <article className="summary-card gold-card">
          <div className="summary-top">
            <span>Customer dues</span>
            <span className="summary-icon gold">रु</span>
          </div>
          <strong className="customer-money">
            {data ? money(data.summary.receivableNpr) : '—'}
            <small>NPR</small>
          </strong>
          <p>Total owed to the shop</p>
        </article>
        <article className="summary-card">
          <div className="summary-top">
            <span>Advances held</span>
            <span className="summary-icon neutral">रु</span>
          </div>
          <strong className="customer-money">
            {data ? money(data.summary.advanceNpr) : '—'}
            <small>NPR</small>
          </strong>
          <p>Customer funds held by the shop</p>
        </article>
      </section>
      <p className="account-scope-note">
        Opening balances, recorded sales, order advances and payments appear
        here. Exchanges will post into these accounts as that module is added.
      </p>
      <section
        className="stock-panel"
        aria-labelledby="customer-register-title"
        aria-busy={loading}
      >
        <div className="stock-heading">
          <div>
            <h2 id="customer-register-title">
              Customer register <span>{data?.list.total ?? '—'}</span>
            </h2>
            <p>
              Search before adding a customer. Shared phone numbers are allowed.
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh
          </button>
        </div>
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              aria-label="Search customers"
              placeholder="Search name, phone, PAN or code…"
              maxLength={120}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">Filter by balance</span>
            <select
              aria-label="Filter by balance"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All balances</option>
              <option value="DUE">Customer owes</option>
              <option value="ADVANCE">Advance held</option>
              <option value="SETTLED">Settled</option>
            </select>
          </label>
        </div>
        {loading ? (
          <div className="empty-state" role="status">
            <span className="loading-dot" />
            <p>Loading customer accounts…</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <h3>Customer accounts couldn’t load</h3>
            <p className="error" role="alert">
              {error}
            </p>
            <button
              className="button secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : data?.list.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Customer / code</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th className="numeric">Account balance</th>
                  <th>
                    <span className="sr-only">Account</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.list.items.map((customer) => {
                  const account = balance(customer.balanceNpr);
                  return (
                    <tr key={customer.id}>
                      <td>
                        <a
                          className="item-link"
                          href={`#/customers/${customer.id}`}
                        >
                          {customer.name}
                        </a>
                        <code>{customer.customerCode}</code>
                      </td>
                      <td>{customer.phone || '—'}</td>
                      <td className="customer-address">
                        {customer.address || '—'}
                      </td>
                      <td
                        className={`numeric customer-balance ${account.className}`}
                      >
                        <strong>{account.amount}</strong>
                        <small>NPR · {account.label}</small>
                      </td>
                      <td>
                        <a
                          className="icon-button"
                          aria-label={`Open ${customer.customerCode}`}
                          href={`#/customers/${customer.id}`}
                        >
                          <Icon name="arrow" size={18} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="users" size={30} />
            </span>
            <h3>
              {term || filter !== 'ALL'
                ? 'No matching customers'
                : 'Start with your first customer'}
            </h3>
            <p>
              {term || filter !== 'ALL'
                ? 'Try another search or balance filter.'
                : 'Add a customer and bring forward their existing dues or advance.'}
            </p>
            {!term && filter === 'ALL' && (
              <button
                className="button secondary"
                onClick={() => setCreating(true)}
              >
                <Icon name="plus" size={17} />
                Add first customer
              </button>
            )}
          </div>
        )}
        <div className="table-footer">
          <span>
            {data ? `${data.list.total} customer records` : 'Customer register'}
          </span>
          <div className="pagination">
            <button
              aria-label="Previous customer page"
              disabled={page === 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              ‹
            </button>
            <span>Page {page}</span>
            <button
              aria-label="Next customer page"
              disabled={
                !data || page * data.list.pageSize >= data.list.total || loading
              }
              onClick={() => setPage((value) => value + 1)}
            >
              ›
            </button>
          </div>
        </div>
      </section>
      {creating && (
        <CustomerForm
          onClose={() => setCreating(false)}
          onSaved={(customer) => {
            setCreating(false);
            globalThis.location.hash = `/customers/${customer.id}`;
          }}
        />
      )}
    </AppShell>
  );
}
