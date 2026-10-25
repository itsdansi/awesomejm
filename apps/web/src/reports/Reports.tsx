import { DateValue, PeriodValue } from '../settings/DateValue';
import { useAuth } from '../auth/AuthContext';
import { t, message, useLanguage } from '../i18n/language';
import { useState, type FormEvent } from 'react';
import {
  nepalToday,
  reportsQuerySchema,
  reportsSchema,
  type ReportsQuery,
} from '@awesomejm/contracts';
import { useResource } from '../shared/useResource';
import { money, methodTitle } from '../customers/format';
import { ActivityCards, StockTable } from './ReportParts';
import { downloadCsv } from './csv';
export function Reports() {
  useLanguage();
  const { user } = useAuth();

  const today = nepalToday(),
    [from, setFrom] = useState(`${today.slice(0, 7)}-01`),
    [to, setTo] = useState(today),
    [groupBy, setGroupBy] = useState<'DAY' | 'MONTH'>('DAY');
  const [query, setQuery] = useState<ReportsQuery>({ from, to, groupBy }),
    [revision, setRevision] = useState(0),
    [error, setError] = useState('');
  const result = useResource(
      `/reports?${new URLSearchParams(query)}`,
      reportsSchema,
      revision,
    ),
    report = result.data;
  function apply(event: FormEvent) {
    event.preventDefault();
    const parsed = reportsQuerySchema.safeParse({ from, to, groupBy });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('\n'));
      return;
    }
    setError('');
    setQuery(parsed.data);
    setRevision((v) => v + 1);
  }
  function preset(kind: 'today' | 'month' | 'previous') {
    let first = today,
      last = today;
    if (kind === 'month') first = `${today.slice(0, 7)}-01`;
    if (kind === 'previous') {
      const date = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
      date.setUTCDate(0);
      last = date.toISOString().slice(0, 10);
      first = `${last.slice(0, 7)}-01`;
    }
    setFrom(first);
    setTo(last);
    setQuery({ from: first, to: last, groupBy });
    setError('');
  }
  function exportActivity() {
    if (!report) return;
    const keys = [
      'period',
      'postedSales',
      'cancelledSales',
      'salesNpr',
      'salesCorrectionsNpr',
      'netSalesNpr',
      'postedPurchases',
      'cancelledPurchases',
      'purchasesNpr',
      'purchaseCorrectionsNpr',
      'netPurchasesNpr',
      'receivedNpr',
      'paidNpr',
      'netCashNpr',
    ] as const;
    downloadCsv(
      `awesomejm-activity-$<DateValue value={report.from} />-$<DateValue value={report.to} />.csv`,
      [...keys],
      report.series.map((row) => keys.map((key) => row[key])),
    );
  }
  function exportStock() {
    if (!report) return;
    const keys = [
      'stockClass',
      'metal',
      'fineness',
      'openingCount',
      'closingCount',
      'openingGrams',
      'receivedGrams',
      'issuedGrams',
      'correctionGrams',
      'closingGrams',
      'closingFineGrams',
    ] as const;
    downloadCsv(
      `awesomejm-stock-$<DateValue value={report.from} />-$<DateValue value={report.to} />.csv`,
      [...keys],
      report.stock.map((row) => keys.map((key) => row[key])),
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{t('reports.title')}</h1>
        </div>
        <div className="order-heading-actions">
          <button
            className="button secondary"
            disabled={!report}
            onClick={exportActivity}
          >
            {t('reports.overview.activityCsv')}
          </button>
          <button
            className="button secondary"
            disabled={!report}
            onClick={exportStock}
          >
            {t('reports.overview.stockCsv')}
          </button>
          <button
            className="button secondary"
            disabled={!report}
            onClick={() => globalThis.print()}
          >
            {t('reports.overview.printReport')}
          </button>
        </div>
      </div>
      <form className="report-filters stock-panel" onSubmit={apply}>
        <div className="report-presets">
          <button
            type="button"
            className="text-button"
            onClick={() => preset('today')}
          >
            {t('common.labels.today')}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => preset('month')}
          >
            {t('reports.overview.thisMonth')}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => preset('previous')}
          >
            {t('reports.overview.previousMonth')}
          </button>
          <span>{t('settings.range')}</span>
        </div>
        <div className="toolbar sales-toolbar">
          <label className="date-filter">
            {t('common.labels.fromAd')}
            <input
              required
              type="date"
              min="2000-01-01"
              max={to || today}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="date-filter">
            {t('common.labels.toAd')}
            <input
              required
              type="date"
              min={from}
              max={today}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">
              {t('reports.overview.reportGrouping')}
            </span>
            <select
              aria-label={t('reports.overview.reportGrouping')}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'DAY' | 'MONTH')}
            >
              <option value="DAY">{t('reports.overview.daily')}</option>
              <option value="MONTH">{t('reports.overview.monthly')}</option>
            </select>
          </label>
          <button className="button primary" disabled={result.loading}>
            {t('reports.overview.applyPeriod')}
          </button>
        </div>
        {error && (
          <p className="error report-filter-error" role="alert">
            {message(error)}
          </p>
        )}
      </form>
      {result.loading ? (
        <div className="empty-state" role="status">
          {t('reports.overview.loadingReports')}
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>{t('reports.overview.reportsCouldnTLoad')}</h2>
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
        report && (
          <div className="print-document report-document">
            <div className="report-print-title">
              <p className="eyebrow">
                {t('common.print.shopHeading', { shopName: user.shopName })}
              </p>
              <h2>
                <DateValue value={report.from} /> —{' '}
                <DateValue value={report.to} />
              </h2>
              <p>
                {report.groupBy === 'DAY'
                  ? t('reports.overview.daily')
                  : t('reports.overview.monthly')}{' '}
                {' ' + t('reports.overview.activityNprNepalTime')}
              </p>
            </div>
            <ActivityCards totals={report.totals} />
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>
                    {report.groupBy === 'DAY'
                      ? t('reports.overview.daily')
                      : t('reports.overview.monthly')}{' '}
                    {' ' + t('reports.overview.activity')}
                  </h2>
                </div>
              </div>
              <div className="table-scroll">
                <table className="activity-report">
                  <thead>
                    <tr>
                      <th>{t('settings.period')}</th>
                      <th className="numeric">
                        {t('reports.overview.netSalesNpr')}
                      </th>
                      <th className="numeric">
                        {t('reports.overview.netPurchasesNpr')}
                      </th>
                      <th className="numeric">
                        {t('reports.overview.receiptsNetNpr')}
                      </th>
                      <th className="numeric">
                        {t('reports.overview.payoutsNetNpr')}
                      </th>
                      <th className="numeric">
                        {t('reports.overview.netMovementNpr')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.series.map((row) => (
                      <tr key={row.period}>
                        <td>
                          <strong>
                            <PeriodValue
                              value={row.period}
                              range={{ from: report.from, to: report.to }}
                            />
                          </strong>
                        </td>
                        <td className="numeric">
                          {money(row.netSalesNpr)}
                          <small className="rate-subline">
                            {row.postedSales}{' '}
                            {' ' + t('reports.overview.sales') + ' '}
                            {row.cancelledSales}{' '}
                            {t('reports.overview.corrections')}
                          </small>
                          {row.cancelledSales > 0 && (
                            <small className="rate-subline">
                              {t('common.labels.gross') + ' '}
                              {money(row.salesNpr)}{' '}
                              {' ' + t('reports.overview.corrections2')}{' '}
                              {money(row.salesCorrectionsNpr)}
                            </small>
                          )}
                        </td>
                        <td className="numeric">
                          {money(row.netPurchasesNpr)}
                          <small className="rate-subline">
                            {row.postedPurchases}{' '}
                            {' ' + t('reports.overview.purchases')}{' '}
                            {row.cancelledPurchases}{' '}
                            {' ' + t('reports.overview.corrections')}
                          </small>
                          {row.cancelledPurchases > 0 && (
                            <small className="rate-subline">
                              {t('common.labels.gross') + ' '}
                              {money(row.purchasesNpr)}{' '}
                              {' ' + t('reports.overview.corrections2')}{' '}
                              {money(row.purchaseCorrectionsNpr)}
                            </small>
                          )}
                        </td>
                        <td className="numeric">{money(row.receivedNpr)}</td>
                        <td className="numeric">{money(row.paidNpr)}</td>
                        <td className="numeric">
                          <strong>{money(row.netCashNpr)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>{t('reports.overview.total')}</th>
                      <th className="numeric">
                        {money(report.totals.netSalesNpr)}
                      </th>
                      <th className="numeric">
                        {money(report.totals.netPurchasesNpr)}
                      </th>
                      <th className="numeric">
                        {money(report.totals.receivedNpr)}
                      </th>
                      <th className="numeric">
                        {money(report.totals.paidNpr)}
                      </th>
                      <th className="numeric">
                        {money(report.totals.netCashNpr)}
                      </th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
            <div className="report-secondary-grid">
              <section className="stock-panel">
                <div className="stock-heading">
                  <div>
                    <h2>{t('reports.overview.byPaymentMethod')}</h2>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('common.labels.method')}</th>
                        <th className="numeric">
                          {t('reports.overview.received')}
                        </th>
                        <th className="numeric">
                          {t('reports.overview.paidOut')}
                        </th>
                        <th className="numeric">
                          {t('reports.overview.netNpr')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.methods.map((row) => (
                        <tr key={row.method}>
                          <td>{t(methodTitle[row.method])}</td>
                          <td className="numeric">{money(row.receivedNpr)}</td>
                          <td className="numeric">{money(row.paidNpr)}</td>
                          <td className="numeric">
                            <strong>{money(row.netCashNpr)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="stock-panel report-account-balances">
                <p className="eyebrow">
                  {t('reports.overview.customerAccountsAt') + ' '}
                  <DateValue value={report.to} />
                </p>
                <dl>
                  <div>
                    <dt>{t('common.labels.customerDues')}</dt>
                    <dd className="due">
                      {t('common.money.currency') + ' '}
                      {money(report.accounts.duesNpr)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('common.labels.advancesCreditHeld')}</dt>
                    <dd className="advance">
                      {t('common.money.currency') + ' '}
                      {money(report.accounts.advancesNpr)}
                    </dd>
                  </div>
                </dl>
                <p>{t('reports.overview.customerBalanceHelp')}</p>
              </section>
            </div>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('reports.overview.physicalStockReconciliation')}</h2>
                </div>
              </div>
              <StockTable rows={report.stock} />
            </section>
            <p className="account-scope-note">
              {t('reports.overview.scopeHelp')}
            </p>
          </div>
        )
      )}
    </>
  );
}
