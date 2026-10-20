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
              <th>{t('Piece / quoted rate')}</th>
              <th className="numeric">{t('Net metal')}</th>
              <th className="numeric">{t('Billed wastage')}</th>
              <th className="numeric">{t('Making')}</th>
              <th className="numeric">{t('Stones')}</th>
              <th className="numeric">{t('Line total')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.item.id}>
                <td>
                  <strong className="sale-piece-name">{line.item.name}</strong>
                  <code>
                    {line.item.itemCode} ·{' '}
                    {line.item.metal === 'GOLD' ? t('Gold') : t('Silver')}{' '}
                    {line.item.fineness}‰
                  </code>
                  <small className="rate-subline">
                    {t('NPR ')}
                    {money(line.rate.sellRatePerTola)} {t(' / tola ·')}{' '}
                    {line.rate.gramsPerTola} {t(' g/tola')}
                  </small>
                  <small className="rate-subline">
                    {t('Gross ')}
                    {line.item.grossWeightGrams} {t(' g · Stone/other')}{' '}
                    {line.item.nonMetalWeightGrams} {t(' g')}
                  </small>
                </td>
                <td className="numeric">
                  {money(line.metalNpr)}
                  <small className="rate-subline">
                    {line.item.netWeightGrams} {t(' g')}
                  </small>
                </td>
                <td className="numeric">
                  {money(line.wastageNpr)}
                  <small className="rate-subline">
                    {line.wastageGrams} {t(' g billed')}
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
          <p className="eyebrow">{t('CUSTOMER ACCOUNT AFTER POSTING')}</p>
          <strong className={account.className}>
            {t('NPR ')}
            {account.amount}
          </strong>
          <p>
            {t(account.label)}
            {t('. Includes the customer’s earlier balance.')}
          </p>
          <small>
            {t(
              'Physical stock movement uses net metal weight. Billed wastage is a charge, separate from physical stock.',
            )}
          </small>
        </div>
        <dl className="sale-totals">
          <div>
            <dt>{t('Subtotal')}</dt>
            <dd>{money(totals.subtotalNpr)}</dd>
          </div>
          <div>
            <dt>{t('Discount')}</dt>
            <dd>− {money(totals.discountNpr)}</dd>
          </div>
          <div>
            <dt>{t('Tax / fees from bill')}</dt>
            <dd>{money(totals.taxNpr)}</dd>
          </div>
          <div className="sale-grand-total">
            <dt>{t('Sale total (NPR)')}</dt>
            <dd>{money(totals.totalNpr)}</dd>
          </div>
          <div>
            <dt>{t('Received at posting')}</dt>
            <dd>{money(totals.paymentNpr)}</dd>
          </div>
          <div>
            <dt>{t('Earlier advance applied')}</dt>
            <dd>{money(totals.advanceAppliedNpr)}</dd>
          </div>
          <div className="sale-due">
            <dt>{t('Due at posting')}</dt>
            <dd>{money(totals.dueAtPostingNpr)}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
