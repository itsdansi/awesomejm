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
          <p className="eyebrow">{t('OLD METAL, CLEARLY ACCOUNTED FOR')}</p>
          <h1>
            {t('Purchases & exchanges')}
            <span>.</span>
          </h1>
          <p className="description">
            {t(
              'Weigh incoming gold and silver, retain its valuation and settle with the customer.',
            )}
          </p>
        </div>
        <Permission name="purchases.write">
          <a href="#/purchases/new" className="button primary">
            <Icon name="plus" size={18} />
            {t('Buy / exchange metal')}
          </a>
        </Permission>
      </div>
      <p className="account-scope-note">
        {t(
          'Old metal is kept in separate lots. Exchange sales, account credit and any payout are posted together. Refining and melting are separate future workflows.',
        )}
      </p>
      <section className="stock-panel" aria-busy={data.loading}>
        <div className="stock-heading">
          <div>
            <h2>
              {t('Purchase register ')}
              <span>{data.data?.total ?? '—'}</span>
            </h2>
            <p>
              {t(
                'Search purchase code, customer or reference. Corrections remain visible.',
              )}
            </p>
          </div>
          <button
            className="text-button"
            onClick={() => setRevision((v) => v + 1)}
          >
            {t('Refresh')}
          </button>
        </div>
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              aria-label={t('Search purchases')}
              maxLength={120}
              placeholder={t('Search purchases or customers…')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">{t('Purchase status')}</span>
            <select
              aria-label={t('Purchase status')}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">{t('All records')}</option>
              <option value="POSTED">{t('Posted')}</option>
              <option value="CANCELLED">{t('Cancelled')}</option>
            </select>
          </label>
        </div>
        {data.loading ? (
          <div className="empty-state" role="status">
            {t('Loading purchases…')}
          </div>
        ) : data.error ? (
          <div className="empty-state">
            <h3>{t('Purchases couldn’t load')}</h3>
            <p className="error" role="alert">
              {message(data.error)}
            </p>
            <button
              className="button secondary"
              onClick={() => setRevision((v) => v + 1)}
            >
              {t('Try again')}
            </button>
          </div>
        ) : data.data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('Purchase / date (AD)')}</th>
                  <th>{t('Customer')}</th>
                  <th>{t('Type / status')}</th>
                  <th className="numeric">{t('Old-metal value (NPR)')}</th>
                  <th className="numeric">{t('Paid out (NPR)')}</th>
                  <th>
                    <span className="sr-only">{t('Details')}</span>
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
                          ? t('Cancelled')
                          : p.saleId
                            ? t('Exchange')
                            : t('Purchase')}
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
                        aria-label={t('Open {value0}', {
                          value0: p.purchaseCode,
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
                ? t('No matching purchases')
                : t('Record the metal coming in')}
            </h3>
            <p>
              {t(
                'Buy old gold or silver, or exchange it for available jewellery.',
              )}
            </p>
            <Permission name="purchases.write">
              <a className="button secondary" href="#/purchases/new">
                {t('Buy / exchange metal')}
              </a>
            </Permission>
          </div>
        )}
        <div className="table-footer">
          <span>
            {data.data?.total ?? '—'} {t(' purchase records')}
          </span>
          <div className="pagination">
            <button
              aria-label={t('Previous purchase page')}
              disabled={page === 1 || data.loading}
              onClick={() => setPage((v) => v - 1)}
            >
              ‹
            </button>
            <span>
              {t('Page ')}
              {page}
            </span>
            <button
              aria-label={t('Next purchase page')}
              disabled={
                !data.data ||
                page * data.data.pageSize >= data.data.total ||
                data.loading
              }
              onClick={() => setPage((v) => v + 1)}
            >
              ›
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
