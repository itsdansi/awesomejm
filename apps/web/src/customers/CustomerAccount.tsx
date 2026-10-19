import { useEffect, useState } from 'react';
import {
  customerDetailSchema,
  customerStatementSchema,
  nepalToday,
  type AccountEntry,
  type AccountPayment,
  type CustomerDetail,
  type CustomerStatement,
} from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { Icon } from '../shared/ui';
import { request, errorMessage } from '../shared/api';
import { CustomerForm } from './CustomerForm';
import { PaymentForm } from './PaymentForm';
import { EntryDetails } from './EntryDetails';
import { balance, entryTitle, methodTitle, money } from './format';

export function CustomerAccount({ customerId }: { customerId: string }) {
  const [result, setResult] = useState<{
    key: string;
    data: { detail: CustomerDetail; statement: CustomerStatement } | null;
    error: string;
  } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [payment, setPayment] = useState<AccountPayment['kind'] | null>(null);
  const [entry, setEntry] = useState<AccountEntry | null>(null);
  const [notice, setNotice] = useState('');
  const key = JSON.stringify([customerId, from, to, page, revision]);
  const loading = result?.key !== key;
  const data = result?.data;
  const error = loading ? '' : result?.error;
  const customer = data?.statement.customer;
  const account = customer ? balance(customer.balanceNpr) : null;
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      page: String(page),
      pageSize: '15',
    });
    void Promise.all([
      request(`/customers/${customerId}`, customerDetailSchema, {
        signal: controller.signal,
      }),
      request(
        `/customers/${customerId}/ledger?${query}`,
        customerStatementSchema,
        { signal: controller.signal },
      ),
    ])
      .then(([detail, statement]) => {
        if (!controller.signal.aborted)
          setResult({ key, data: { detail, statement }, error: '' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, data: null, error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [customerId, from, to, page, key]);
  function saved(message: string, financial = false) {
    setEditing(false);
    setPayment(null);
    setEntry(null);
    setNotice(message);
    setRevision((value) => value + 1);
    if (financial) {
      setFrom('');
      setTo('');
      setPage(1);
    }
  }
  return (
    <AppShell section="Customers">
      <a className="back-link" href="#/customers">
        ← Customer register
      </a>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            CUSTOMER ACCOUNT / {customer?.customerCode ?? '—'}
          </p>
          <h1>
            {customer?.name ?? 'Customer account'}
            <span>.</span>
          </h1>
          <p className="description">
            {customer
              ? `Opened ${customer.openedOn} AD · Customer details and account statement`
              : 'Loading customer details…'}
          </p>
        </div>
        <div className="account-actions">
          <button
            className="button secondary"
            disabled={!customer || loading}
            onClick={() => setEditing(true)}
          >
            Edit profile
          </button>
          <button
            className="button primary"
            disabled={!customer || loading}
            onClick={() => setPayment('PAYMENT')}
          >
            <Icon name="plus" size={17} />
            Record payment
          </button>
        </div>
      </div>
      {notice && (
        <div className="success" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setNotice('')}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {error ? (
        <div className="stock-panel empty-state">
          <h3>Customer account couldn’t load</h3>
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
      ) : customer && account && data ? (
        <>
          <section
            className="customer-overview"
            aria-label="Customer account overview"
          >
            <article className="customer-contact">
              <div className="customer-avatar">
                <Icon name="users" size={25} />
              </div>
              <div>
                <p>{customer.phone || 'Phone not provided'}</p>
                <p>{customer.address || 'Address not provided'}</p>
                <small>PAN: {customer.pan || '—'}</small>
                {customer.notes && (
                  <p className="customer-notes">{customer.notes}</p>
                )}
              </div>
            </article>
            <article className={`account-total ${account.className}`}>
              <span>Current balance · {account.label}</span>
              <strong>
                <small>NPR </small>
                {account.amount}
              </strong>
              <p>
                {account.className === 'due'
                  ? 'Amount the customer owes the shop.'
                  : account.className === 'advance'
                    ? 'Customer funds held by the shop.'
                    : 'No outstanding dues or advance.'}
              </p>
              <button
                className="text-button"
                disabled={account.className !== 'advance' || loading}
                onClick={() => setPayment('ADVANCE_REFUND')}
              >
                Record advance refund →
              </button>
            </article>
          </section>
          <section
            className="stock-panel"
            aria-labelledby="statement-title"
            aria-busy={loading}
          >
            <div className="stock-heading">
              <div>
                <h2 id="statement-title">
                  Account statement <span>{data.statement.total}</span>
                </h2>
                <p>
                  Positive balance = customer owes · Negative balance = advance
                  held
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => setRevision((value) => value + 1)}
              >
                Refresh
              </button>
            </div>
            <div className="toolbar rate-toolbar history-toolbar">
              <label className="date-filter">
                From (AD)
                <input
                  aria-label="Statement start date"
                  type="date"
                  min="2000-01-01"
                  max={to || nepalToday()}
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className="date-filter">
                To (AD)
                <input
                  aria-label="Statement end date"
                  type="date"
                  min={from || '2000-01-01'}
                  max={nepalToday()}
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              {(from || to) && (
                <button
                  className="text-button"
                  onClick={() => {
                    setFrom('');
                    setTo('');
                    setPage(1);
                  }}
                >
                  Clear dates
                </button>
              )}
            </div>
            <div className="statement-balances">
              <span>
                Period opening{' '}
                <strong>
                  NPR {loading ? '—' : money(data.statement.openingBalanceNpr)}
                </strong>
              </span>
              <span>
                Period closing{' '}
                <strong>
                  NPR {loading ? '—' : money(data.statement.closingBalanceNpr)}
                </strong>
              </span>
            </div>
            {loading ? (
              <div className="history-placeholder" role="status">
                Loading statement…
              </div>
            ) : data.statement.items.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date / entry</th>
                      <th>Particulars</th>
                      <th className="numeric">Debit (NPR)</th>
                      <th className="numeric">Credit (NPR)</th>
                      <th className="numeric">Balance after entry</th>
                      <th>
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.statement.items.map((item) => {
                      const credit = item.amountNpr.startsWith('-');
                      return (
                        <tr key={item.id}>
                          <td>
                            <strong className="history-date">
                              {item.entryDate}
                            </strong>
                            <code>{item.entryCode}</code>
                          </td>
                          <td>
                            <span>{entryTitle[item.kind]}</span>
                            {item.reversed && (
                              <small className="reversed-badge">Reversed</small>
                            )}
                            <small className="rate-subline">
                              {item.method
                                ? methodTitle[item.method]
                                : item.reference || 'Account balance'}
                            </small>
                          </td>
                          <td className="numeric">
                            {credit ? '—' : money(item.amountNpr)}
                          </td>
                          <td className="numeric">
                            {credit ? money(item.amountNpr.slice(1)) : '—'}
                          </td>
                          <td className="numeric">
                            {money(item.runningBalanceNpr)}
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={`View ${item.entryCode}`}
                              onClick={() => setEntry(item)}
                            >
                              <Icon name="arrow" size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state rate-empty">
                <span className="empty-icon">
                  <Icon name="history" size={30} />
                </span>
                <h3>
                  {from || to
                    ? 'No entries in this period'
                    : 'No account entries yet'}
                </h3>
                <p>
                  {from || to
                    ? 'Choose another date range to view this customer’s entries.'
                    : 'Record a received payment to begin this account’s history.'}
                </p>
              </div>
            )}
            <div className="table-footer">
              <span>{data.statement.total} entries · Newest first</span>
              <div className="pagination">
                <button
                  aria-label="Previous statement page"
                  disabled={page === 1 || loading}
                  onClick={() => setPage((value) => value - 1)}
                >
                  ‹
                </button>
                <span>Page {page}</span>
                <button
                  aria-label="Next statement page"
                  disabled={
                    page * data.statement.pageSize >= data.statement.total ||
                    loading
                  }
                  onClick={() => setPage((value) => value + 1)}
                >
                  ›
                </button>
              </div>
            </div>
          </section>
          <details className="profile-history">
            <summary>Profile history · Latest 20 changes</summary>
            <ol>
              {data.detail.profileHistory.map((change) => (
                <li key={change.version}>
                  <strong>
                    Version {change.version} · {change.name}
                  </strong>
                  <p>{change.reason}</p>
                  <small>
                    {change.phone || 'No phone'} ·{' '}
                    {change.address || 'No address'} · PAN {change.pan || '—'}
                  </small>
                  <time dateTime={change.changedAt}>
                    {new Date(change.changedAt).toLocaleString('en-NP', {
                      timeZone: 'Asia/Kathmandu',
                    })}{' '}
                    NPT
                  </time>
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : (
        <div className="empty-state" role="status">
          <span className="loading-dot" />
          <p>Loading the customer account…</p>
        </div>
      )}
      {editing && customer && (
        <CustomerForm
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={() =>
            saved(
              'Customer profile updated. The change is recorded in profile history.',
            )
          }
        />
      )}
      {payment && customer && (
        <PaymentForm
          customer={customer}
          kind={payment}
          onClose={() => setPayment(null)}
          onSaved={() =>
            saved(
              payment === 'PAYMENT'
                ? 'Payment recorded. The customer balance is up to date.'
                : 'Advance refund recorded. The customer balance is up to date.',
              true,
            )
          }
        />
      )}
      {entry && customer && (
        <EntryDetails
          customer={customer}
          entry={entry}
          onClose={() => setEntry(null)}
          onSaved={() =>
            saved(
              'Entry reversed. The original and its correction remain in the statement.',
              true,
            )
          }
        />
      )}
    </AppShell>
  );
}
