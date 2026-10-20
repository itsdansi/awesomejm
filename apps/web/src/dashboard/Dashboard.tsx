import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
import { useState } from 'react';
import { dashboardSchema } from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { Icon } from '../shared/ui';
import { useResource } from '../shared/useResource';
import { money } from '../customers/format';
import { ActivityCards } from '../reports/ReportParts';
export function Dashboard() {
  useLanguage();

  const [revision, setRevision] = useState(0),
    result = useResource('/dashboard', dashboardSchema, revision),
    data = result.data;
  return (
    <AppShell section="Dashboard">
      <div className="page-heading">
        <div>
          <h1>
            {t('dashboard.dashboard.shopOverview')}
            <span>.</span>
          </h1>
          <p className="description">
            {data
              ? t('dashboard.overview.asOfDate', { date: data.date })
              : t('dashboard.dashboard.todaySTradeStockAndCustomerBalances')}
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          {t('dashboard.dashboard.refreshOverview')}
        </button>
      </div>
      <div className="dashboard-quick-actions">
        <Permission name="sales.write">
          <a className="button primary" href="#/sales/new">
            <Icon name="plus" size={17} />
            {t('common.labels.recordASale')}
          </a>
        </Permission>
        <Permission name="purchases.write">
          <a className="button secondary" href="#/purchases/new">
            {t('common.labels.buyExchangeMetal')}
            <Icon name="arrow" size={17} />
          </a>
        </Permission>
        <Permission name="orders.write">
          <a className="button secondary" href="#/orders/new">
            {t('common.labels.bookAnOrder')}
            <Icon name="arrow" size={17} />
          </a>
        </Permission>
        <a className="text-button" href="#/reports">
          {t('dashboard.dashboard.openReports')}
        </a>
      </div>
      {result.loading ? (
        <div className="empty-state" role="status">
          {t('dashboard.dashboard.loadingShopOverview')}
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>{t('dashboard.dashboard.theOverviewCouldnTLoad')}</h2>
          <p className="error" role="alert">
            {message(result.error)}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            {t('common.actions.tryAgain')}
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
                    {data.missingRates}{' '}
                    {' ' +
                      t(
                        'dashboard.dashboard.stockMetalPurityCombinationsNeedTodaySRate',
                      )}
                  </a>
                )}
                {data.orders.overdue > 0 && (
                  <a href="#/orders">
                    <Icon name="history" size={17} />
                    {data.orders.overdue}{' '}
                    {' ' +
                      t('dashboard.dashboard.ordersArePastTheirPromisedDate')}
                  </a>
                )}
              </div>
            )}
            <div className="section-caption">
              <h2>{t('dashboard.dashboard.todaySActivity')}</h2>
              <span>
                {t('dashboard.dashboard.netOfCorrectionsRecordedToday')}
              </span>
            </div>
            <ActivityCards totals={data.today} />
            <section className="dashboard-month stock-panel">
              <div>
                <p className="eyebrow">
                  {t('dashboard.dashboard.monthToDate')}
                </p>
                <h2>{data.date.slice(0, 7)}</h2>
              </div>
              <div>
                <small>{t('common.labels.netSales')}</small>
                <strong>
                  {t('common.money.currency') + ' '}
                  {money(data.month.netSalesNpr)}
                </strong>
              </div>
              <div>
                <small>{t('dashboard.dashboard.netPurchases')}</small>
                <strong>
                  {t('common.money.currency') + ' '}
                  {money(data.month.netPurchasesNpr)}
                </strong>
              </div>
              <div>
                <small>{t('common.labels.netMoneyMovement')}</small>
                <strong>
                  {t('common.money.currency') + ' '}
                  {money(data.month.netCashNpr)}
                </strong>
              </div>
            </section>
            <div className="dashboard-grid">
              <section className="stock-panel">
                <div className="stock-heading">
                  <div>
                    <h2>{t('dashboard.dashboard.availableMetal')}</h2>
                    <p>
                      {t(
                        'dashboard.dashboard.physicalNetWeightHeldGroupedByPurity',
                      )}
                    </p>
                  </div>
                  <a className="text-button" href="#/reports">
                    {t('dashboard.dashboard.reconciliation')}
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
                              {row.metal === 'GOLD'
                                ? t('common.metals.gold')
                                : t('common.metals.silver')}{' '}
                              · {row.fineness}‰
                            </strong>
                            <small>
                              {row.stockClass === 'JEWELLERY'
                                ? t('dashboard.dashboard.readyMadeJewellery')
                                : t('common.labels.oldMetalLots')}{' '}
                              · {row.closingCount}{' '}
                              {' ' + t('common.labels.piecesLots')}
                            </small>
                          </div>
                          <span className="dashboard-weight">
                            <strong>
                              {row.closingGrams}{' '}
                              <small>{t('common.units.grams')}</small>
                            </strong>
                            <small>
                              {t('dashboard.dashboard.fine') + ' '}
                              {row.closingFineGrams}{' '}
                              {' ' + t('common.units.grams')}
                            </small>
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <h3>{t('dashboard.dashboard.noMetalInStockYet')}</h3>
                    <p>
                      {t(
                        'dashboard.dashboard.receiveJewelleryOrRecordAnOldMetalPurchase',
                      )}
                    </p>
                  </div>
                )}
              </section>
              <div className="dashboard-right">
                <section className="stock-panel dashboard-accounts">
                  <p className="eyebrow">
                    {t('dashboard.dashboard.customerAccounts')}
                  </p>
                  <dl>
                    <div>
                      <dt>{t('common.labels.customerDues')}</dt>
                      <dd className="due">
                        {t('common.money.currency') + ' '}
                        {money(data.accounts.duesNpr)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('common.labels.advancesCreditHeld')}</dt>
                      <dd className="advance">
                        {t('common.money.currency') + ' '}
                        {money(data.accounts.advancesNpr)}
                      </dd>
                    </div>
                  </dl>
                  <a className="text-button" href="#/customers">
                    {t('dashboard.dashboard.viewCustomerAccounts')}
                  </a>
                </section>
                <section className="stock-panel dashboard-orders">
                  <div className="stock-heading">
                    <div>
                      <h2>{t('dashboard.dashboard.orderDesk')}</h2>
                      <p>
                        {t(
                          'dashboard.dashboard.trackThePromisesStillInProgress',
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="dashboard-order-counts">
                    <div>
                      <strong>{data.orders.active}</strong>
                      <small>{t('common.labels.active')}</small>
                    </div>
                    <div>
                      <strong>{data.orders.ready}</strong>
                      <small>{t('common.labels.ready')}</small>
                    </div>
                    <div>
                      <strong
                        className={data.orders.overdue ? 'danger-text' : ''}
                      >
                        {data.orders.overdue}
                      </strong>
                      <small>{t('common.labels.overdue')}</small>
                    </div>
                  </div>
                  <a className="text-button" href="#/orders">
                    {t('dashboard.dashboard.openOrderBook')}
                  </a>
                </section>
              </div>
            </div>
            <section className="stock-panel dashboard-recent">
              <div className="stock-heading">
                <div>
                  <h2>{t('dashboard.dashboard.recentTradeRecords')}</h2>
                  <p>
                    {t(
                      'dashboard.dashboard.salesAndOldMetalPurchasesExchangesAppearAs',
                    )}
                  </p>
                </div>
              </div>
              {data.recent.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('dashboard.dashboard.recordDateAd')}</th>
                        <th>{t('common.labels.customerAtPosting')}</th>
                        <th>{t('dashboard.dashboard.type')}</th>
                        <th className="numeric">
                          {t('dashboard.dashboard.valueNpr')}
                        </th>
                        <th>{t('common.labels.status')}</th>
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
                              ? t('common.labels.sale')
                              : t('common.labels.oldMetalPurchase')}
                          </td>
                          <td className="numeric">
                            <strong>{money(row.totalNpr)}</strong>
                          </td>
                          <td>
                            <span
                              className={`status ${row.cancelled ? 'voided' : ''}`}
                            >
                              {row.cancelled
                                ? t('common.status.cancelled')
                                : t('common.labels.posted')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <h3>
                    {t('dashboard.dashboard.yourNextTransactionWillAppearHere')}
                  </h3>
                  <p>
                    {t('dashboard.dashboard.startWithACustomerStockAndTodayS')}
                  </p>
                </div>
              )}
            </section>
            <p className="account-scope-note">
              {t('dashboard.overview.moneyMovementHelp')}
            </p>
          </>
        )
      )}
    </AppShell>
  );
}
