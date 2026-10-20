import type { PurchasePreview, SaleDetail } from '@awesomejm/contracts';
import { balance, money } from '../customers/format';
export function PurchaseFigures({
  lines,
  totalNpr,
  saleLines,
  saleTotalNpr,
  receivedNpr,
  payoutNpr,
  balanceBeforeNpr,
  balanceAfterNpr,
}: {
  lines: PurchasePreview['lines'];
  totalNpr: string;
  saleLines: SaleDetail['lines'];
  saleTotalNpr: string;
  receivedNpr: string;
  payoutNpr: string;
  balanceBeforeNpr: string;
  balanceAfterNpr: string;
}) {
  const closing = balance(balanceAfterNpr),
    opening = balance(balanceBeforeNpr);
  return (
    <>
      <div className="table-scroll">
        <table className="purchase-lines">
          <thead>
            <tr>
              <th>Incoming lot / assay</th>
              <th className="numeric">Physical net</th>
              <th className="numeric">Buying quote</th>
              <th className="numeric">Agreed deductions</th>
              <th className="numeric">Credit (NPR)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <strong className="sale-piece-name">{line.name}</strong>
                  <code>
                    {line.metal === 'GOLD' ? 'Gold' : 'Silver'} ·{' '}
                    {line.fineness}‰
                  </code>
                  <small className="rate-subline">{line.assayNotes}</small>
                  <small className="rate-subline">
                    Gross {line.grossWeightGrams} g · stone/other{' '}
                    {line.nonMetalWeightGrams} g
                  </small>
                </td>
                <td className="numeric">
                  {line.netWeightGrams} g
                  <small className="rate-subline">
                    Fine equivalent {line.fineWeightGrams} g
                  </small>
                  <small className="rate-subline">
                    Payable {line.payableWeightGrams} g
                  </small>
                </td>
                <td className="numeric">
                  {money(line.rate.buyRatePerTola)}
                  <small className="rate-subline">
                    NPR/tola · {line.rate.gramsPerTola} g/tola
                  </small>
                  <small className="rate-subline">
                    Metal value {money(line.metalNpr)}
                  </small>
                </td>
                <td className="numeric">
                  {line.deductedWeightGrams} g
                  <small className="rate-subline">
                    NPR {money(line.deductionNpr)}
                  </small>
                  <small className="rate-subline">
                    {line.deductionReason || 'No deductions'}
                  </small>
                </td>
                <td className="numeric">
                  <strong>{money(line.totalNpr)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {saleLines.length > 0 && (
        <>
          <div className="stock-heading">
            <div>
              <h2>Outgoing jewellery</h2>
              <p>The new pieces supplied in this exchange.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Piece</th>
                  <th className="numeric">Net grams</th>
                  <th className="numeric">Metal / wastage</th>
                  <th className="numeric">Making / stones</th>
                  <th className="numeric">Line value (NPR)</th>
                </tr>
              </thead>
              <tbody>
                {saleLines.map((line) => (
                  <tr key={line.item.id}>
                    <td>
                      <strong>{line.item.name}</strong>
                      <code>
                        {line.item.itemCode} · {line.item.fineness}‰
                      </code>
                    </td>
                    <td className="numeric">{line.item.netWeightGrams}</td>
                    <td className="numeric">
                      {money(line.metalNpr)}
                      <small className="rate-subline">
                        Wastage {money(line.wastageNpr)}
                      </small>
                    </td>
                    <td className="numeric">
                      {money(line.makingNpr)}
                      <small className="rate-subline">
                        Stones {money(line.stonesNpr)}
                      </small>
                    </td>
                    <td className="numeric">
                      <strong>{money(line.lineTotalNpr)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="sale-settlement">
        <div className="sale-account-note">
          <p className="eyebrow">ACCOUNT AFTER COMPLETE SETTLEMENT</p>
          <strong className={closing.className}>NPR {closing.amount}</strong>
          <p>{closing.label}. Includes earlier customer transactions.</p>
          <small>
            Full physical net metal is received into old-metal lots. Deductions
            affect valuation, not the metal held.
          </small>
        </div>
        <dl className="sale-totals">
          <div>
            <dt>Earlier balance · {opening.label}</dt>
            <dd>{opening.amount}</dd>
          </div>
          <div>
            <dt>Old-metal credit</dt>
            <dd>− {money(totalNpr)}</dd>
          </div>
          <div>
            <dt>New jewellery total</dt>
            <dd>{money(saleTotalNpr)}</dd>
          </div>
          <div>
            <dt>Received now</dt>
            <dd>− {money(receivedNpr)}</dd>
          </div>
          <div>
            <dt>Paid out now</dt>
            <dd>{money(payoutNpr)}</dd>
          </div>
          <div className="sale-grand-total">
            <dt>Balance (signed NPR)</dt>
            <dd>{money(balanceAfterNpr)}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
