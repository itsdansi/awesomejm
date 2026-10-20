import { t, message, useLanguage } from '../i18n/language';
import type { BusinessReport } from '@awesomejm/contracts';
import { money } from '../customers/format';
export function ActivityCards({
  totals,
}: {
  totals: BusinessReport['totals'];
}) {
  useLanguage();

  return (
    <section
      className="summary-cards report-summary"
      aria-label={t('Period totals')}
    >
      {[
        {
          label: 'Net sales',
          value: totals.netSalesNpr,
          note: t('{sales} sales · {corrections} corrections', {
            sales: totals.postedSales,
            corrections: totals.cancelledSales,
          }),
        },
        {
          label: 'Net old-metal purchases',
          value: totals.netPurchasesNpr,
          note: t('{purchases} purchases · {corrections} corrections', {
            purchases: totals.postedPurchases,
            corrections: totals.cancelledPurchases,
          }),
        },
        {
          label: 'Net money movement',
          value: totals.netCashNpr,
          note: 'Recorded receipts minus payouts, including corrections',
        },
      ].map((card, index) => (
        <article
          className={`summary-card ${index === 0 ? 'gold-card' : ''}`}
          key={card.label}
        >
          <div className="summary-top">
            <span>{t(card.label)}</span>
            <span className="summary-icon neutral">{t('रु')}</span>
          </div>
          <strong className="customer-money">
            {money(card.value)}
            <small>{t('NPR')}</small>
          </strong>
          <p>{message(card.note)}</p>
        </article>
      ))}
    </section>
  );
}
export function StockTable({ rows }: { rows: BusinessReport['stock'] }) {
  useLanguage();

  return rows.length ? (
    <div className="table-scroll">
      <table className="report-stock">
        <thead>
          <tr>
            <th>{t('Stock / purity')}</th>
            <th className="numeric">{t('Opening (g)')}</th>
            <th className="numeric">{t('Received (g)')}</th>
            <th className="numeric">{t('Sold (g)')}</th>
            <th className="numeric">{t('Corrections (g)')}</th>
            <th className="numeric">{t('Closing net (g)')}</th>
            <th className="numeric">{t('Closing fine (g)')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.stockClass}:${row.metal}:${row.fineness}`}>
              <td>
                <span className={`metal-badge ${row.metal.toLowerCase()}`}>
                  {row.metal === 'GOLD' ? t('Gold') : t('Silver')}
                </span>
                <strong className="rate-purity">{row.fineness}‰</strong>
                <small className="rate-subline">
                  {row.stockClass === 'JEWELLERY'
                    ? t('Jewellery')
                    : t('Old-metal lots')}
                </small>
              </td>
              <td className="numeric">
                {row.openingGrams}
                <small className="rate-subline">
                  {row.openingCount} {t(' pieces/lots')}
                </small>
              </td>
              <td className="numeric">{row.receivedGrams}</td>
              <td className="numeric">{row.issuedGrams}</td>
              <td className="numeric">{row.correctionGrams}</td>
              <td className="numeric">
                <strong>{row.closingGrams}</strong>
                <small className="rate-subline">
                  {row.closingCount} {t(' pieces/lots')}
                </small>
              </td>
              <td className="numeric">{row.closingFineGrams}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty-state">
      <h3>{t('No stock movements through this date')}</h3>
      <p>{t('Received pieces and old-metal purchases will appear here.')}</p>
    </div>
  );
}
