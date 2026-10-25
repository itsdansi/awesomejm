import { WeightValue } from '../shared/WeightValue';
import { t, useLanguage } from '../i18n/language';
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
      aria-label={t('reports.reportParts.periodTotals')}
    >
      {[
        {
          label: t('common.labels.netSales'),
          value: totals.netSalesNpr,
          note: t('reports.reportParts.salesCorrections', {
            sales: totals.postedSales,
            corrections: totals.cancelledSales,
          }),
        },
        {
          label: t('reports.reportParts.netOldMetalPurchases'),
          value: totals.netPurchasesNpr,
          note: t('reports.reportParts.purchasesCorrections', {
            purchases: totals.postedPurchases,
            corrections: totals.cancelledPurchases,
          }),
        },
        {
          label: t('common.labels.netMoneyMovement'),
          value: totals.netCashNpr,
        },
      ].map((card, index) => (
        <article
          className={`summary-card ${index === 0 ? 'gold-card' : ''}`}
          key={card.label}
        >
          <div className="summary-top">
            <span>{card.label}</span>
            <span className="summary-icon neutral">
              {t('common.money.symbol')}
            </span>
          </div>
          <strong className="customer-money">
            {money(card.value)}
            <small>{t('common.money.currency')}</small>
          </strong>
          {card.note && <p>{card.note}</p>}
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
            <th>{t('reports.reportParts.stockPurity')}</th>
            <th className="numeric">{t('weights.fields.opening')}</th>
            <th className="numeric">{t('weights.fields.received')}</th>
            <th className="numeric">{t('weights.fields.sold')}</th>
            <th className="numeric">{t('weights.fields.corrections')}</th>
            <th className="numeric">{t('weights.fields.closingNet')}</th>
            <th className="numeric">{t('weights.fields.closingFine')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.stockClass}:${row.metal}:${row.fineness}`}>
              <td>
                <span className={`metal-badge ${row.metal.toLowerCase()}`}>
                  {row.metal === 'GOLD'
                    ? t('common.metals.gold')
                    : t('common.metals.silver')}
                </span>
                <strong className="rate-purity">{row.fineness}‰</strong>
                <small className="rate-subline">
                  {row.stockClass === 'JEWELLERY'
                    ? t('reports.reportParts.jewellery')
                    : t('common.labels.oldMetalLots')}
                </small>
              </td>
              <td className="numeric">
                <WeightValue grams={row.openingGrams} stacked />
                <small className="rate-subline">
                  {row.openingCount} {' ' + t('common.labels.piecesLots')}
                </small>
              </td>
              <td className="numeric">
                <WeightValue grams={row.receivedGrams} stacked />
              </td>
              <td className="numeric">
                <WeightValue grams={row.issuedGrams} stacked />
              </td>
              <td className="numeric">
                <WeightValue grams={row.correctionGrams} stacked />
              </td>
              <td className="numeric">
                <strong>
                  <WeightValue grams={row.closingGrams} stacked />
                </strong>
                <small className="rate-subline">
                  {row.closingCount} {' ' + t('common.labels.piecesLots')}
                </small>
              </td>
              <td className="numeric">
                <WeightValue grams={row.closingFineGrams} stacked />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty-state">
      <h3>{t('reports.reportParts.noStockMovementsThroughThisDate')}</h3>
      <p>
        {t('reports.reportParts.receivedPiecesAndOldMetalPurchasesWillAppear')}
      </p>
    </div>
  );
}
