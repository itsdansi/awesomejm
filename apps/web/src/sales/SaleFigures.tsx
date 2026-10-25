import { WeightValue } from '../shared/WeightValue';
import { t, useLanguage } from '../i18n/language';
import type { SalePreview } from '@awesomejm/contracts';
import { balance, money } from '../customers/format';

export function SaleFigures({
  lines,
  totals,
}: {
  lines: SalePreview['lines'];
  totals: Omit<SalePreview, 'lines' | 'customer' | 'saleDate' | 'order'>;
}) {
  useLanguage();

  const account = balance(totals.balanceAfterNpr);
  return (
    <>
      <div className="table-scroll">
        <table className="sale-lines">
          <thead>
            <tr>
              <th>{t('sales.saleFigures.pieceQuotedRate')}</th>
              <th className="numeric">{t('sales.saleFigures.netMetal')}</th>
              <th className="numeric">
                {t('sales.saleFigures.billedWastage')}
              </th>
              <th className="numeric">{t('sales.saleFigures.making')}</th>
              <th className="numeric">{t('common.labels.stones')}</th>
              <th className="numeric">{t('sales.saleFigures.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.item.id}>
                <td>
                  <strong className="sale-piece-name">{line.item.name}</strong>
                  <code>
                    {line.item.itemCode} ·{' '}
                    {line.item.metal === 'GOLD'
                      ? t('common.metals.gold')
                      : t('common.metals.silver')}{' '}
                    {line.item.fineness}‰
                  </code>
                  <small className="rate-subline">
                    {t('common.money.currency') + ' '}
                    {money(line.rate.sellRatePerTola)}{' '}
                    {' ' + t('sales.saleFigures.tola')} {line.rate.gramsPerTola}{' '}
                    {' ' + t('common.labels.gTola')}
                  </small>
                  <small className="rate-subline">
                    {t('common.labels.gross') + ' '}
                    <WeightValue
                      grams={line.item.grossWeightGrams}
                      gramsPerTola={line.item.gramsPerTola}
                    />{' '}
                    {' / ' + t('weights.fields.nonMetal')}{' '}
                    <WeightValue
                      grams={line.item.nonMetalWeightGrams}
                      gramsPerTola={line.item.gramsPerTola}
                    />
                  </small>
                </td>
                <td className="numeric">
                  {money(line.metalNpr)}
                  <small className="rate-subline">
                    <WeightValue
                      grams={line.item.netWeightGrams}
                      gramsPerTola={line.item.gramsPerTola}
                    />
                  </small>
                </td>
                <td className="numeric">
                  {money(line.wastageNpr)}
                  <small className="rate-subline">
                    <WeightValue
                      grams={line.wastageGrams}
                      gramsPerTola={line.rate.gramsPerTola}
                    />
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
          <p className="eyebrow">
            {t('sales.saleFigures.customerAccountAfterPosting')}
          </p>
          <strong className={account.className}>
            {t('common.money.currency') + ' '}
            {account.amount}
          </strong>
          <p>
            {t(account.label)}
            {t('sales.saleFigures.includesTheCustomerSEarlierBalance')}
          </p>
          <small>
            {t(
              'sales.saleFigures.physicalStockMovementUsesNetMetalWeightBilled',
            )}
          </small>
        </div>
        <dl className="sale-totals">
          <div>
            <dt>{t('sales.saleFigures.subtotal')}</dt>
            <dd>{money(totals.subtotalNpr)}</dd>
          </div>
          <div>
            <dt>{t('sales.saleFigures.discount')}</dt>
            <dd>− {money(totals.discountNpr)}</dd>
          </div>
          <div>
            <dt>{t('sales.saleFigures.taxFeesFromBill')}</dt>
            <dd>{money(totals.taxNpr)}</dd>
          </div>
          <div className="sale-grand-total">
            <dt>{t('sales.labels.saleTotalNpr')}</dt>
            <dd>{money(totals.totalNpr)}</dd>
          </div>
          <div>
            <dt>{t('sales.labels.receivedAtPosting')}</dt>
            <dd>{money(totals.paymentNpr)}</dd>
          </div>
          <div>
            <dt>{t('sales.saleFigures.earlierAdvanceApplied')}</dt>
            <dd>{money(totals.advanceAppliedNpr)}</dd>
          </div>
          <div className="sale-due">
            <dt>{t('sales.saleFigures.dueAtPosting')}</dt>
            <dd>{money(totals.dueAtPostingNpr)}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
