import type { BusinessReport } from '@awesomejm/contracts';
import { money } from '../customers/format';
export function ActivityCards({
  totals,
}: {
  totals: BusinessReport['totals'];
}) {
  return (
    <section
      className="summary-cards report-summary"
      aria-label="Period totals"
    >
      {[
        {
          label: 'Net sales',
          value: totals.netSalesNpr,
          note: `${totals.postedSales} sales · ${totals.cancelledSales} corrections`,
        },
        {
          label: 'Net old-metal purchases',
          value: totals.netPurchasesNpr,
          note: `${totals.postedPurchases} purchases · ${totals.cancelledPurchases} corrections`,
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
            <span>{card.label}</span>
            <span className="summary-icon neutral">रु</span>
          </div>
          <strong className="customer-money">
            {money(card.value)}
            <small>NPR</small>
          </strong>
          <p>{card.note}</p>
        </article>
      ))}
    </section>
  );
}
export function StockTable({ rows }: { rows: BusinessReport['stock'] }) {
  return rows.length ? (
    <div className="table-scroll">
      <table className="report-stock">
        <thead>
          <tr>
            <th>Stock / purity</th>
            <th className="numeric">Opening (g)</th>
            <th className="numeric">Received (g)</th>
            <th className="numeric">Sold (g)</th>
            <th className="numeric">Corrections (g)</th>
            <th className="numeric">Closing net (g)</th>
            <th className="numeric">Closing fine (g)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.stockClass}:${row.metal}:${row.fineness}`}>
              <td>
                <span className={`metal-badge ${row.metal.toLowerCase()}`}>
                  {row.metal === 'GOLD' ? 'Gold' : 'Silver'}
                </span>
                <strong className="rate-purity">{row.fineness}‰</strong>
                <small className="rate-subline">
                  {row.stockClass === 'JEWELLERY'
                    ? 'Jewellery'
                    : 'Old-metal lots'}
                </small>
              </td>
              <td className="numeric">
                {row.openingGrams}
                <small className="rate-subline">
                  {row.openingCount} pieces/lots
                </small>
              </td>
              <td className="numeric">{row.receivedGrams}</td>
              <td className="numeric">{row.issuedGrams}</td>
              <td className="numeric">{row.correctionGrams}</td>
              <td className="numeric">
                <strong>{row.closingGrams}</strong>
                <small className="rate-subline">
                  {row.closingCount} pieces/lots
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
      <h3>No stock movements through this date</h3>
      <p>Received pieces and old-metal purchases will appear here.</p>
    </div>
  );
}
