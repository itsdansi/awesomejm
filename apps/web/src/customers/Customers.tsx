import { Pagination } from '../shared/Pagination';
import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
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
  useLanguage();

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
          <h1>{t('customers.labels.customerAccounts')}</h1>
        </div>
        <Permission name="customers.write">
          <button className="button primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} />
            {t('customers.labels.addACustomer')}
          </button>
        </Permission>
      </div>
      <section
        className="summary-cards"
        aria-label={t('customers.list.customerAccountTotals')}
      >
        <article className="summary-card">
          <div className="summary-top">
            <span>{t('common.navigation.customers')}</span>
            <span className="summary-icon neutral">
              <Icon name="users" />
            </span>
          </div>
          <strong>{data?.summary.customers ?? '—'}</strong>
        </article>
        <article className="summary-card gold-card">
          <div className="summary-top">
            <span>{t('common.labels.customerDues')}</span>
            <span className="summary-icon gold">
              {t('common.money.symbol')}
            </span>
          </div>
          <strong className="customer-money">
            {data ? money(data.summary.receivableNpr) : '—'}
            <small>{t('common.money.currency')}</small>
          </strong>
        </article>
        <article className="summary-card">
          <div className="summary-top">
            <span>{t('customers.list.advancesHeld')}</span>
            <span className="summary-icon neutral">
              {t('common.money.symbol')}
            </span>
          </div>
          <strong className="customer-money">
            {data ? money(data.summary.advanceNpr) : '—'}
            <small>{t('common.money.currency')}</small>
          </strong>
        </article>
      </section>

      <section
        className="stock-panel"
        aria-labelledby="customer-register-title"
        aria-busy={loading}
      >
        <div className="stock-heading">
          <div>
            <h2 id="customer-register-title">
              {t('customers.list.customerRegister') + ' '}
              <span>{data?.list.total ?? '—'}</span>
            </h2>
          </div>
          <button
            className="text-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t('common.actions.refresh')}
          </button>
        </div>
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              aria-label={t('customers.list.searchCustomers')}
              placeholder={t('customers.list.searchNamePhonePanOrCode')}
              maxLength={120}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">
              {t('customers.list.filterByBalance')}
            </span>
            <select
              aria-label={t('customers.list.filterByBalance')}
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">{t('customers.list.allBalances')}</option>
              <option value="DUE">{t('customers.labels.customerOwes')}</option>
              <option value="ADVANCE">
                {t('customers.labels.advanceHeld')}
              </option>
              <option value="SETTLED">{t('customers.labels.settled')}</option>
            </select>
          </label>
        </div>
        {loading ? (
          <div className="empty-state" role="status">
            <span className="loading-dot" />
            <p>{t('customers.list.loadingCustomerAccounts')}</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <h3>{t('customers.list.customerAccountsCouldnTLoad')}</h3>
            <p className="error" role="alert">
              {message(error)}
            </p>
            <button
              className="button secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('common.actions.tryAgain')}
            </button>
          </div>
        ) : data?.list.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('customers.list.customerCode')}</th>
                  <th>{t('common.fields.phone')}</th>
                  <th>{t('common.fields.address')}</th>
                  <th className="numeric">
                    {t('customers.labels.accountBalance')}
                  </th>
                  <th>
                    <span className="sr-only">
                      {t('common.navigation.account')}
                    </span>
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
                        <small>
                          {t('customers.list.npr') + ' '}
                          {t(account.label)}
                        </small>
                      </td>
                      <td>
                        <a
                          className="icon-button"
                          aria-label={t('common.labels.open', {
                            code: customer.customerCode,
                          })}
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
                ? t('customers.list.noMatchingCustomers')
                : t('customers.list.startWithYourFirstCustomer')}
            </h3>
            <p>
              {term || filter !== 'ALL'
                ? t('customers.list.tryAnotherSearchOrBalanceFilter')
                : t('customers.list.addACustomerAndBringForwardTheirExisting')}
            </p>
            {!term && filter === 'ALL' && (
              <Permission name="customers.write">
                <button
                  className="button secondary"
                  onClick={() => setCreating(true)}
                >
                  <Icon name="plus" size={17} />
                  {t('customers.list.addFirstCustomer')}
                </button>
              </Permission>
            )}
          </div>
        )}
        <div className="table-footer">
          <span>
            {data
              ? t('customers.list.customerRecords', { count: data.list.total })
              : t('customers.list.customerRegister')}
          </span>
          <Pagination
            page={page}
            pageSize={data?.list.pageSize ?? 15}
            total={data?.list.total}
            loading={loading}
            onPageChange={setPage}
          />
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
