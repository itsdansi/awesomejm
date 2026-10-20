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
              <th>{t('purchases.purchaseFigures.incomingLotAssay')}</th>
              <th className="numeric">
                {t('purchases.purchaseFigures.physicalNet')}
              </th>
              <th className="numeric">
                {t('purchases.purchaseFigures.buyingQuote')}
              </th>
              <th className="numeric">
                {t('purchases.purchaseFigures.agreedDeductions')}
              </th>
              <th className="numeric">{t('common.labels.creditNpr')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <strong className="sale-piece-name">{line.name}</strong>
                  <code>
                    {line.metal === 'GOLD'
                      ? t('common.metals.gold')
                      : t('common.metals.silver')}{' '}
                    · {line.fineness}‰
                  </code>
                  <small className="rate-subline">{line.assayNotes}</small>
                  <small className="rate-subline">
                    {t('common.labels.gross') + ' '}
                    {line.grossWeightGrams}{' '}
                    {' ' + t('purchases.purchaseFigures.gStoneOther')}{' '}
                    {line.nonMetalWeightGrams} {' ' + t('common.units.grams')}
                  </small>
                </td>
                <td className="numeric">
                  {line.netWeightGrams} {' ' + t('common.units.grams')}
                  <small className="rate-subline">
                    {t('purchases.purchaseFigures.fineEquivalent') + ' '}
                    {line.fineWeightGrams} {' ' + t('common.units.grams')}
                  </small>
                  <small className="rate-subline">
                    {t('purchases.purchaseFigures.payable') + ' '}
                    {line.payableWeightGrams} {' ' + t('common.units.grams')}
                  </small>
                </td>
                <td className="numeric">
                  {money(line.rate.buyRatePerTola)}
                  <small className="rate-subline">
                    {t('purchases.purchaseFigures.nprTola') + ' '}
                    {line.rate.gramsPerTola} {' ' + t('common.labels.gTola')}
                  </small>
                  <small className="rate-subline">
                    {t('purchases.purchaseFigures.metalValue') + ' '}
                    {money(line.metalNpr)}
                  </small>
                </td>
                <td className="numeric">
                  {line.deductedWeightGrams} {' ' + t('common.units.grams')}
                  <small className="rate-subline">
                    {t('common.money.currency') + ' '}
                    {money(line.deductionNpr)}
                  </small>
                  <small className="rate-subline">
                    {line.deductionReason ||
                      t('purchases.purchaseFigures.noDeductions')}
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
              <h2>{t('purchases.purchaseFigures.outgoingJewellery')}</h2>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('purchases.purchaseFigures.piece')}</th>
                  <th className="numeric">
                    {t('purchases.purchaseFigures.netGrams')}
                  </th>
                  <th className="numeric">
                    {t('purchases.purchaseFigures.metalWastage')}
                  </th>
                  <th className="numeric">
                    {t('purchases.purchaseFigures.makingStones')}
                  </th>
                  <th className="numeric">
                    {t('purchases.purchaseFigures.lineValueNpr')}
                  </th>
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
                        {t('purchases.purchaseFigures.wastage') + ' '}
                        {money(line.wastageNpr)}
                      </small>
                    </td>
                    <td className="numeric">
                      {money(line.makingNpr)}
                      <small className="rate-subline">
                        {t('common.labels.stones') + ' '}
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
          <p className="eyebrow">
            {t('purchases.purchaseFigures.accountAfterCompleteSettlement')}
          </p>
          <strong className={closing.className}>
            {t('common.money.currency') + ' '}
            {closing.amount}
          </strong>
          <p>
            {t(closing.label)}
            {t('purchases.purchaseFigures.includesEarlierCustomerTransactions')}
          </p>
          <small>
            {t(
              'purchases.purchaseFigures.fullPhysicalNetMetalIsReceivedIntoOld',
            )}
          </small>
        </div>
        <dl className="sale-totals">
          <div>
            <dt>
              {t('purchases.purchaseFigures.earlierBalance') + ' '}
              {t(opening.label)}
            </dt>
            <dd>{opening.amount}</dd>
          </div>
          <div>
            <dt>{t('purchases.purchaseFigures.oldMetalCredit')}</dt>
            <dd>− {money(totalNpr)}</dd>
          </div>
          <div>
            <dt>{t('purchases.purchaseFigures.newJewelleryTotal')}</dt>
            <dd>{money(saleTotalNpr)}</dd>
          </div>
          <div>
            <dt>{t('purchases.purchaseFigures.receivedNow')}</dt>
            <dd>− {money(receivedNpr)}</dd>
          </div>
          <div>
            <dt>{t('purchases.purchaseFigures.paidOutNow')}</dt>
            <dd>{money(payoutNpr)}</dd>
          </div>
          <div className="sale-grand-total">
            <dt>{t('purchases.purchaseFigures.balanceSignedNpr')}</dt>
            <dd>{money(balanceAfterNpr)}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
