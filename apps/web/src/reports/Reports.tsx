import { useAuth } from '../auth/AuthContext';
import { t, message, useLanguage } from '../i18n/language';
import { useState, type FormEvent } from 'react';
import {
  nepalToday,
  reportsQuerySchema,
  reportsSchema,
  type ReportsQuery,
} from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
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
      `awesomejm-activity-${report.from}-${report.to}.csv`,
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
      `awesomejm-stock-${report.from}-${report.to}.csv`,
      [...keys],
      report.stock.map((row) => keys.map((key) => row[key])),
    );
  }
  return (
    <AppShell section="Reports">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('THE DAY’S WORK, IN CLEAR NUMBERS')}</p>
          <h1>
            {t('Business reports')}
            <span>.</span>
          </h1>
          <p className="description">
            {t(
              'Daily and monthly sales, old-metal purchases, money movements and physical stock.',
            )}
          </p>
        </div>
        <div className="order-heading-actions">
          <button
            className="button secondary"
            disabled={!report}
            onClick={exportActivity}
          >
            {t('Activity CSV')}
          </button>
          <button
            className="button secondary"
            disabled={!report}
            onClick={exportStock}
          >
            {t('Stock CSV')}
          </button>
          <button
            className="button secondary"
            disabled={!report}
            onClick={() => globalThis.print()}
          >
            {t('Print report')}
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
            {t('Today')}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => preset('month')}
          >
            {t('This month')}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => preset('previous')}
          >
            {t('Previous month')}
          </button>
          <span>{t('AD dates · Nepal time')}</span>
        </div>
        <div className="toolbar sales-toolbar">
          <label className="date-filter">
            {t('From (AD)')}
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
            {t('To (AD)')}
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
            <span className="sr-only">{t('Report grouping')}</span>
            <select
              aria-label={t('Report grouping')}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'DAY' | 'MONTH')}
            >
              <option value="DAY">{t('Daily')}</option>
              <option value="MONTH">{t('Monthly')}</option>
            </select>
          </label>
          <button className="button primary" disabled={result.loading}>
            {t('Apply period')}
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
          {t('Loading reports…')}
        </div>
      ) : result.error ? (
        <div className="empty-state">
          <h2>{t('Reports couldn’t load')}</h2>
          <p className="error" role="alert">
            {message(result.error)}
          </p>
          <button
            className="button secondary"
            onClick={() => setRevision((v) => v + 1)}
          >
            {t('Try again')}
          </button>
        </div>
      ) : (
        report && (
          <div className="print-document report-document">
            <div className="report-print-title">
              <p className="eyebrow">
                {t('AWESOMEJM / {shopName}', { shopName: user.shopName })}
              </p>
              <h2>
                {report.from} — {report.to} {t(' AD')}
              </h2>
              <p>
                {report.groupBy === 'DAY' ? t('Daily') : t('Monthly')}{' '}
                {t(' activity · NPR · Nepal time')}
              </p>
            </div>
            <ActivityCards totals={report.totals} />
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>
                    {report.groupBy === 'DAY' ? t('Daily') : t('Monthly')}{' '}
                    {t(' activity')}
                  </h2>
                  <p>
                    {t(
                      'Net values include corrections on their recorded correction dates.',
                    )}
                  </p>
                </div>
              </div>
              <div className="table-scroll">
                <table className="activity-report">
                  <thead>
                    <tr>
                      <th>{t('Period (AD)')}</th>
                      <th className="numeric">{t('Net sales (NPR)')}</th>
                      <th className="numeric">{t('Net purchases (NPR)')}</th>
                      <th className="numeric">{t('Receipts, net (NPR)')}</th>
                      <th className="numeric">{t('Payouts, net (NPR)')}</th>
                      <th className="numeric">{t('Net movement (NPR)')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.series.map((row) => (
                      <tr key={row.period}>
                        <td>
                          <strong>{row.period}</strong>
                        </td>
                        <td className="numeric">
                          {money(row.netSalesNpr)}
                          <small className="rate-subline">
                            {row.postedSales} {t(' sales · ')}
                            {row.cancelledSales} {t('corrections')}
                          </small>
                          {row.cancelledSales > 0 && (
                            <small className="rate-subline">
                              {t('Gross ')}
                              {money(row.salesNpr)} {t(' − corrections')}{' '}
                              {money(row.salesCorrectionsNpr)}
                            </small>
                          )}
                        </td>
                        <td className="numeric">
                          {money(row.netPurchasesNpr)}
                          <small className="rate-subline">
                            {row.postedPurchases} {t(' purchases ·')}{' '}
                            {row.cancelledPurchases} {t(' corrections')}
                          </small>
                          {row.cancelledPurchases > 0 && (
                            <small className="rate-subline">
                              {t('Gross ')}
                              {money(row.purchasesNpr)} {t(' − corrections')}{' '}
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
                      <th>{t('Total')}</th>
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
                    <h2>{t('By payment method')}</h2>
                    <p>{t('Recorded money movements, net of corrections.')}</p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('Method')}</th>
                        <th className="numeric">{t('Received')}</th>
                        <th className="numeric">{t('Paid out')}</th>
                        <th className="numeric">{t('Net NPR')}</th>
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
                  {t('CUSTOMER ACCOUNTS AT ')}
                  {report.to} {t(' AD')}
                </p>
                <dl>
                  <div>
                    <dt>{t('Customer dues')}</dt>
                    <dd className="due">
                      {t('NPR ')}
                      {money(report.accounts.duesNpr)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Advances / credit held')}</dt>
                    <dd className="advance">
                      {t('NPR ')}
                      {money(report.accounts.advancesNpr)}
                    </dd>
                  </div>
                </dl>
                <p>
                  {t(
                    'Separate customer balances, calculated through the end date.',
                  )}
                </p>
              </section>
            </div>
            <section className="stock-panel">
              <div className="stock-heading">
                <div>
                  <h2>{t('Physical stock reconciliation')}</h2>
                  <p>
                    {t(
                      'Opening + received − sold + corrections = closing. All weights are grams.',
                    )}
                  </p>
                </div>
              </div>
              <StockTable rows={report.stock} />
            </section>
            <p className="account-scope-note">
              {t(
                'These are operational reports, not profit, inventory cost valuation or tax returns. Old-metal purchases are included; supplier jewellery invoices and refining are outside this version. Payouts include purchase payouts and customer advance refunds. Negative period values can result from corrections to earlier periods. Receipts/receipt voids use their Nepal recording date; sales, purchases and their corrections use the recorded business date.',
              )}
            </p>
          </div>
        )
      )}
    </AppShell>
  );
}
