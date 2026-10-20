import { Pagination } from '../shared/Pagination';
import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
import { useState } from 'react';
import { purchasesListSchema } from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { useDebounced, useResource } from '../shared/useResource';
import { Icon } from '../shared/ui';
import { money } from '../customers/format';
import { PurchaseBuilder } from './PurchaseBuilder';
import { PurchaseDetails } from './PurchaseDetails';
export function Purchases({
  purchaseId,
  orderId,
}: {
  purchaseId: string | undefined;
  orderId: string | null;
}) {
  if (purchaseId === 'new')
    return <PurchaseBuilder key={orderId ?? 'new'} orderId={orderId} />;
  if (purchaseId)
    return <PurchaseDetails key={purchaseId} purchaseId={purchaseId} />;
  return <PurchaseRegister />;
}
function PurchaseRegister() {
  useLanguage();

  const [search, setSearch] = useState(''),
    term = useDebounced(search),
    [status, setStatus] = useState('ALL'),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const data = useResource(
    `/purchases?${new URLSearchParams({ search: term, status, page: String(page), pageSize: '15' })}`,
    purchasesListSchema,
    revision,
  );
  return (
    <AppShell section="Purchases">
      <div className="page-heading">
        <div>
          <h1>
            {t('purchases.purchases.purchasesExchanges')}
            <span>.</span>
          </h1>
          <p className="description">
            {t(
              'purchases.purchases.weighIncomingGoldAndSilverRetainItsValuation',
            )}
          </p>
        </div>
        <Permission name="purchases.write">
          <a href="#/purchases/new" className="button primary">
            <Icon name="plus" size={18} />
            {t('common.labels.buyExchangeMetal')}
          </a>
        </Permission>
      </div>
      <p className="account-scope-note">
        {t('purchases.purchases.oldMetalIsKeptInSeparateLotsExchange')}
      </p>
      <section className="stock-panel" aria-busy={data.loading}>
        <div className="stock-heading">
          <div>
            <h2>
              {t('purchases.purchases.purchaseRegister') + ' '}
              <span>{data.data?.total ?? '—'}</span>
            </h2>
            <p>{t('purchases.list.searchHelp')}</p>
          </div>
          <button
            className="text-button"
            onClick={() => setRevision((v) => v + 1)}
          >
            {t('common.actions.refresh')}
          </button>
        </div>
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              aria-label={t('purchases.purchases.searchPurchases')}
              maxLength={120}
              placeholder={t('purchases.purchases.searchPurchasesOrCustomers')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">
              {t('purchases.purchases.purchaseStatus')}
            </span>
            <select
              aria-label={t('purchases.purchases.purchaseStatus')}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">{t('common.filters.allRecords')}</option>
              <option value="POSTED">{t('common.labels.posted')}</option>
              <option value="CANCELLED">{t('common.status.cancelled')}</option>
            </select>
          </label>
        </div>
        {data.loading ? (
          <div className="empty-state" role="status">
            {t('purchases.purchases.loadingPurchases')}
          </div>
        ) : data.error ? (
          <div className="empty-state">
            <h3>{t('purchases.purchases.purchasesCouldnTLoad')}</h3>
            <p className="error" role="alert">
              {message(data.error)}
            </p>
            <button
              className="button secondary"
              onClick={() => setRevision((v) => v + 1)}
            >
              {t('common.actions.tryAgain')}
            </button>
          </div>
        ) : data.data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('purchases.purchases.purchaseDateAd')}</th>
                  <th>{t('common.labels.customer')}</th>
                  <th>{t('purchases.purchases.typeStatus')}</th>
                  <th className="numeric">
                    {t('purchases.purchases.oldMetalValueNpr')}
                  </th>
                  <th className="numeric">
                    {t('purchases.purchases.paidOutNpr')}
                  </th>
                  <th>
                    <span className="sr-only">
                      {t('common.labels.details')}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <a className="item-link" href={`#/purchases/${p.id}`}>
                        {p.purchaseCode}
                      </a>
                      <code>{p.purchaseDate}</code>
                    </td>
                    <td>
                      {p.customerSnapshot.name}
                      <code>
                        {p.reference || p.customerSnapshot.customerCode}
                      </code>
                    </td>
                    <td>
                      <span
                        className={`status ${p.status === 'CANCELLED' ? 'voided' : ''}`}
                      >
                        {p.status === 'CANCELLED'
                          ? t('common.status.cancelled')
                          : p.saleId
                            ? t('purchases.labels.exchange')
                            : t('purchases.purchases.purchase')}
                      </span>
                    </td>
                    <td className="numeric">
                      <strong>{money(p.totalNpr)}</strong>
                    </td>
                    <td className="numeric">{money(p.payoutNpr)}</td>
                    <td>
                      <a
                        className="icon-button"
                        href={`#/purchases/${p.id}`}
                        aria-label={t('common.labels.open', {
                          code: p.purchaseCode,
                        })}
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
              {term || status !== 'ALL'
                ? t('purchases.purchases.noMatchingPurchases')
                : t('purchases.purchases.recordTheMetalComingIn')}
            </h3>
            <p>{t('purchases.purchases.buyOldGoldOrSilverOrExchangeIt')}</p>
            <Permission name="purchases.write">
              <a className="button secondary" href="#/purchases/new">
                {t('common.labels.buyExchangeMetal')}
              </a>
            </Permission>
          </div>
        )}
        <div className="table-footer">
          <span>
            {data.data?.total ?? '—'}{' '}
            {' ' + t('purchases.purchases.purchaseRecords')}
          </span>
          <Pagination
            page={page}
            pageSize={data.data?.pageSize ?? 15}
            total={data.data?.total}
            loading={data.loading}
            onPageChange={setPage}
          />
        </div>
      </section>
    </AppShell>
  );
}
