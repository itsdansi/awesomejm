import type { SalePreview } from '@awesomejm/contracts';
import { balance, money } from '../customers/format';

export function SaleFigures({
  lines,
  totals,
}: {
  lines: SalePreview['lines'];
  totals: Omit<SalePreview, 'lines' | 'customer' | 'saleDate' | 'order'>;
}) {
  const account = balance(totals.balanceAfterNpr);
  return (
    <>
      <div className="table-scroll">
        <table className="sale-lines">
          <thead>
            <tr>
              <th>Piece / quoted rate</th>
              <th className="numeric">Net metal</th>
              <th className="numeric">Billed wastage</th>
              <th className="numeric">Making</th>
              <th className="numeric">Stones</th>
              <th className="numeric">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.item.id}>
                <td>
                  <strong className="sale-piece-name">{line.item.name}</strong>
                  <code>
                    {line.item.itemCode} ·{' '}
                    {line.item.metal === 'GOLD' ? 'Gold' : 'Silver'}{' '}
                    {line.item.fineness}‰
                  </code>
                  <small className="rate-subline">
                    NPR {money(line.rate.sellRatePerTola)} / tola ·{' '}
                    {line.rate.gramsPerTola} g/tola
                  </small>
                  <small className="rate-subline">
                    Gross {line.item.grossWeightGrams} g · Stone/other{' '}
                    {line.item.nonMetalWeightGrams} g
                  </small>
                </td>
                <td className="numeric">
                  {money(line.metalNpr)}
                  <small className="rate-subline">
                    {line.item.netWeightGrams} g
                  </small>
                </td>
                <td className="numeric">
                  {money(line.wastageNpr)}
                  <small className="rate-subline">
                    {line.wastageGrams} g billed
                  </small>
                </td>
                <td className="numeric">{money(line.makingNpr)}</td>
                <td className="numeric">{money(line.stonesNpr)}</td>
                <td className="numeric">
                  <strong>{money(line.lineTotalNpr)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sale-settlement">
        <div className="sale-account-note">
          <p className="eyebrow">CUSTOMER ACCOUNT AFTER POSTING</p>
          <strong className={account.className}>NPR {account.amount}</strong>
          <p>{account.label}. Includes the customer’s earlier balance.</p>
          <small>
            Physical stock movement uses net metal weight. Billed wastage is a
            charge, separate from physical stock.
          </small>
        </div>
        <dl className="sale-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{money(totals.subtotalNpr)}</dd>
          </div>
          <div>
            <dt>Discount</dt>
            <dd>− {money(totals.discountNpr)}</dd>
          </div>
          <div>
            <dt>Tax / fees from bill</dt>
            <dd>{money(totals.taxNpr)}</dd>
          </div>
          <div className="sale-grand-total">
            <dt>Sale total (NPR)</dt>
            <dd>{money(totals.totalNpr)}</dd>
          </div>
          <div>
            <dt>Received at posting</dt>
            <dd>{money(totals.paymentNpr)}</dd>
          </div>
          <div>
            <dt>Earlier advance applied</dt>
            <dd>{money(totals.advanceAppliedNpr)}</dd>
          </div>
          <div className="sale-due">
            <dt>Due at posting</dt>
            <dd>{money(totals.dueAtPostingNpr)}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
