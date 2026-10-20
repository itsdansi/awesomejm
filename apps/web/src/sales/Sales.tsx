import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
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

export function Sales({
  saleId,
  orderId,
}: {
  saleId: string | undefined;
  orderId: string | null;
}) {
  if (saleId === 'new')
    return <SaleBuilder key={orderId ?? 'ready-made'} orderId={orderId} />;
  if (saleId) return <SaleDetails key={saleId} saleId={saleId} />;
  return <SalesRegister />;
}
function SalesRegister() {
  useLanguage();

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
          <p className="eyebrow">
            {t('sales.list.fromYourCounterToTheirCollection')}
          </p>
          <h1>
            {t('sales.list.salesRegister')}
            <span>.</span>
          </h1>
          <p className="description">
            {t('sales.list.everyPieceSoldEveryChargeAndPaymentRecorded')}
          </p>
        </div>
        <Permission name="sales.write">
          <a className="button primary" href="#/sales/new">
            <Icon name="plus" size={18} />
            {t('common.labels.recordASale')}
          </a>
        </Permission>
      </div>
      <section
        className="summary-cards"
        aria-label={t('sales.list.allTimeSalesTotals')}
      >
        <article className="summary-card">
          <div className="summary-top">
            <span>{t('sales.list.postedSales')}</span>
            <span className="summary-icon neutral">
              <Icon name="receipt" />
            </span>
          </div>
          <strong>{summary.data?.posted ?? '—'}</strong>
          <p>{t('sales.list.allTimeExcludesCancelledRecords')}</p>
        </article>
        <article className="summary-card gold-card">
          <div className="summary-top">
            <span>{t('sales.list.recordedSaleValue')}</span>
            <span className="summary-icon gold">
              {t('common.money.symbol')}
            </span>
          </div>
          <strong className="customer-money">
            {summary.data ? money(summary.data.postedTotalNpr) : '—'}
            <small>{t('common.money.currency')}</small>
          </strong>
          <p>{t('sales.list.allTimeIncludesRecordedTaxFees')}</p>
        </article>
        <article className="summary-card">
          <div className="summary-top">
            <span>{t('sales.list.cancelledRecords')}</span>
            <span className="summary-icon neutral">
              <Icon name="history" />
            </span>
          </div>
          <strong>{summary.data?.cancelled ?? '—'}</strong>
          <p>{t('sales.list.correctionsRetainedForYourRecords')}</p>
        </article>
      </section>
      {summary.error && (
        <p className="error" role="alert">
          {t('sales.list.totals') + ' '}
          {message(summary.error)}
        </p>
      )}
      <p className="account-scope-note">
        {t('sales.list.officialBillingHelp')}
      </p>
      <section className="stock-panel" aria-busy={list.loading}>
        <div className="stock-heading">
          <div>
            <h2>
              {t('sales.list.recordedSales') + ' '}
              <span>{list.data?.total ?? '—'}</span>
            </h2>
            <p>{t('sales.list.searchBySaleCodeCustomerNameOrOfficial')}</p>
          </div>
          <button
            className="text-button"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t('common.actions.refresh')}
          </button>
        </div>
        <div className="toolbar sales-toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              aria-label={t('sales.list.searchSales')}
              placeholder={t('sales.list.searchSalesOrCustomers')}
              value={search}
              maxLength={120}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">{t('sales.list.saleStatus')}</span>
            <select
              aria-label={t('sales.list.saleStatus')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">{t('common.filters.allRecords')}</option>
              <option value="POSTED">{t('common.labels.posted')}</option>
              <option value="CANCELLED">{t('common.status.cancelled')}</option>
            </select>
          </label>
          <label className="date-filter">
            {t('common.labels.fromAd')}
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
            {t('common.labels.toAd')}
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
            <p>{t('sales.list.loadingSales')}</p>
          </div>
        ) : list.error ? (
          <div className="empty-state">
            <h3>{t('sales.list.salesCouldnTLoad')}</h3>
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
                  <th>{t('sales.list.saleDateAd')}</th>
                  <th>{t('common.labels.customerAtPosting')}</th>
                  <th>{t('common.labels.status')}</th>
                  <th className="numeric">{t('sales.labels.saleTotalNpr')}</th>
                  <th className="numeric">
                    {t('sales.labels.receivedAtPosting')}
                  </th>
                  <th>
                    <span className="sr-only">{t('sales.list.openSale')}</span>
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
                        {sale.status === 'POSTED'
                          ? t('common.labels.posted')
                          : t('common.status.cancelled')}
                      </span>
                    </td>
                    <td className="numeric">
                      <strong>{money(sale.totalNpr)}</strong>
                    </td>
                    <td className="numeric">{money(sale.paymentNpr)}</td>
                    <td>
                      <a
                        className="icon-button"
                        aria-label={t('common.labels.open', {
                          code: sale.saleCode,
                        })}
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
                ? t('sales.list.noMatchingSales')
                : t('sales.list.readyForYourFirstSale')}
            </h3>
            <p>{t('sales.list.chooseAnAvailablePieceAndACustomerTo')}</p>
            <Permission name="sales.write">
              <a className="button secondary" href="#/sales/new">
                {t('common.labels.recordASale')}
              </a>
            </Permission>
          </div>
        )}
        <div className="table-footer">
          <span>
            {list.data
              ? t('sales.list.saleRecords', { count: list.data.total })
              : t('sales.list.salesRegister')}{' '}
            {' ' + t('sales.list.adDates')}
          </span>
          <div className="pagination">
            <button
              aria-label={t('sales.list.previousSalesPage')}
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
              aria-label={t('sales.list.nextSalesPage')}
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
