import { t, useLanguage } from '../i18n/language';
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
  useLanguage();

  const closing = balance(balanceAfterNpr),
    opening = balance(balanceBeforeNpr);
  return (
    <>
      <div className="table-scroll">
        <table className="purchase-lines">
          <thead>
            <tr>
              <th>{t('Incoming lot / assay')}</th>
              <th className="numeric">{t('Physical net')}</th>
              <th className="numeric">{t('Buying quote')}</th>
              <th className="numeric">{t('Agreed deductions')}</th>
              <th className="numeric">{t('Credit (NPR)')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <strong className="sale-piece-name">{line.name}</strong>
                  <code>
                    {line.metal === 'GOLD' ? t('Gold') : t('Silver')} ·{' '}
                    {line.fineness}‰
                  </code>
                  <small className="rate-subline">{line.assayNotes}</small>
                  <small className="rate-subline">
                    {t('Gross ')}
                    {line.grossWeightGrams} {t(' g · stone/other')}{' '}
                    {line.nonMetalWeightGrams} {t(' g')}
                  </small>
                </td>
                <td className="numeric">
                  {line.netWeightGrams} {t(' g')}
                  <small className="rate-subline">
                    {t('Fine equivalent ')}
                    {line.fineWeightGrams} {t(' g')}
                  </small>
                  <small className="rate-subline">
                    {t('Payable ')}
                    {line.payableWeightGrams} {t(' g')}
                  </small>
                </td>
                <td className="numeric">
                  {money(line.rate.buyRatePerTola)}
                  <small className="rate-subline">
                    {t('NPR/tola · ')}
                    {line.rate.gramsPerTola} {t(' g/tola')}
                  </small>
                  <small className="rate-subline">
                    {t('Metal value ')}
                    {money(line.metalNpr)}
                  </small>
                </td>
                <td className="numeric">
                  {line.deductedWeightGrams} {t(' g')}
                  <small className="rate-subline">
                    {t('NPR ')}
                    {money(line.deductionNpr)}
                  </small>
                  <small className="rate-subline">
                    {line.deductionReason || t('No deductions')}
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
              <h2>{t('Outgoing jewellery')}</h2>
              <p>{t('The new pieces supplied in this exchange.')}</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('Piece')}</th>
                  <th className="numeric">{t('Net grams')}</th>
                  <th className="numeric">{t('Metal / wastage')}</th>
                  <th className="numeric">{t('Making / stones')}</th>
                  <th className="numeric">{t('Line value (NPR)')}</th>
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
                        {t('Wastage ')}
                        {money(line.wastageNpr)}
                      </small>
                    </td>
                    <td className="numeric">
                      {money(line.makingNpr)}
                      <small className="rate-subline">
                        {t('Stones ')}
                        {money(line.stonesNpr)}
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
          <p className="eyebrow">{t('ACCOUNT AFTER COMPLETE SETTLEMENT')}</p>
          <strong className={closing.className}>
            {t('NPR ')}
            {closing.amount}
          </strong>
          <p>
            {t(closing.label)}
            {t('. Includes earlier customer transactions.')}
          </p>
          <small>
            {t(
              'Full physical net metal is received into old-metal lots. Deductions affect valuation, not the metal held.',
            )}
          </small>
        </div>
        <dl className="sale-totals">
          <div>
            <dt>
              {t('Earlier balance · ')}
              {t(opening.label)}
            </dt>
            <dd>{opening.amount}</dd>
          </div>
          <div>
            <dt>{t('Old-metal credit')}</dt>
            <dd>− {money(totalNpr)}</dd>
          </div>
          <div>
            <dt>{t('New jewellery total')}</dt>
            <dd>{money(saleTotalNpr)}</dd>
          </div>
          <div>
            <dt>{t('Received now')}</dt>
            <dd>− {money(receivedNpr)}</dd>
          </div>
          <div>
            <dt>{t('Paid out now')}</dt>
            <dd>{money(payoutNpr)}</dd>
          </div>
          <div className="sale-grand-total">
            <dt>{t('Balance (signed NPR)')}</dt>
            <dd>{money(balanceAfterNpr)}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
