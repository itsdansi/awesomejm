import { DateValue, TimeValue } from '../settings/DateValue';
import { Pagination } from '../shared/Pagination';
import { locale, t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
import { useEffect, useState } from 'react';
import { ratePerGram } from '@awesomejm/calculations';
import {
  nepalToday,
  rateBookSchema,
  rateHistorySchema,
  type MetalRate,
  type RateBook,
  type RateHistory,
} from '@awesomejm/contracts';
import { AppShell } from '../shared/AppShell';
import { errorMessage, request } from '../shared/api';
import { Icon } from '../shared/ui';
import { RateForm } from './RateForm';

const npr = (value: string) =>
  new Intl.NumberFormat(locale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
export function Rates() {
  useLanguage();

  const [date, setDate] = useState(() => nepalToday());
  const [metal, setMetal] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [form, setForm] = useState<{ rate?: MetalRate } | null>(null);
  const [notice, setNotice] = useState('');
  const [bookResult, setBookResult] = useState<{
    key: string;
    data: RateBook | null;
    error: string;
  } | null>(null);
  const [historyResult, setHistoryResult] = useState<{
    key: string;
    data: RateHistory | null;
    error: string;
  } | null>(null);
  const bookKey = JSON.stringify([date, metal, revision]);
  const historyKey = JSON.stringify([from, to, metal, page, revision]);
  const bookLoading = bookResult?.key !== bookKey;
  const historyLoading = historyResult?.key !== historyKey;
  const book = bookLoading ? null : bookResult?.data;
  const history = historyLoading ? null : historyResult?.data;
  const bookError = bookLoading ? '' : bookResult?.error;
  const historyError = historyLoading ? '' : historyResult?.error;
  const today = nepalToday();
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ date, ...(metal ? { metal } : {}) });
    void request(`/rates?${query}`, rateBookSchema, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted)
          setBookResult({ key: bookKey, data, error: '' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setBookResult({
            key: bookKey,
            data: null,
            error: errorMessage(error),
          });
      });
    return () => controller.abort();
  }, [date, metal, bookKey]);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(metal ? { metal } : {}),
      page: String(page),
      pageSize: '10',
    });
    void request(`/rates/history?${query}`, rateHistorySchema, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted)
          setHistoryResult({ key: historyKey, data, error: '' });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setHistoryResult({
            key: historyKey,
            data: null,
            error: errorMessage(error),
          });
      });
    return () => controller.abort();
  }, [from, to, metal, page, historyKey]);
  function refresh() {
    setRevision((value) => value + 1);
  }
  return (
    <AppShell section="Metal rates">
      <div className="page-heading">
        <div>
          <h1>{t('rates.labels.goldSilverRates')}</h1>
        </div>
        <Permission name="rates.write">
          <button
            className="button primary"
            disabled={!date || date > today}
            onClick={() => {
              setForm({});
              setNotice('');
            }}
          >
            <Icon name="plus" size={18} />
            {t('rates.book.setARate')}
          </button>
        </Permission>
      </div>

      {notice && (
        <div className="success" role="status">
          {message(notice)}
          <button
            className="icon-button"
            aria-label={t('common.labels.dismissMessage')}
            onClick={() => setNotice('')}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <section
        className="stock-panel"
        aria-labelledby="rate-book-title"
        aria-busy={bookLoading}
      >
        <div className="stock-heading">
          <div>
            <h2 id="rate-book-title">
              {t('rates.book.dailyRateBook') + ' '}
              <span>{book?.rates.length ?? '—'}</span>
            </h2>
          </div>
          <button className="text-button" onClick={refresh}>
            {t('common.actions.refresh')}
          </button>
        </div>
        <div className="toolbar rate-toolbar">
          <label className="date-filter">
            {t('rates.labels.rateDateAd')}
            <input
              aria-label={t('rates.book.rateBookDate')}
              type="date"
              min="2000-01-01"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <button className="text-button" onClick={() => setDate(nepalToday())}>
            {t('common.labels.today')}
          </button>
          <label className="filter-label">
            <span className="sr-only">{t('common.labels.filterByMetal')}</span>
            <select
              aria-label={t('common.labels.filterByMetal')}
              value={metal}
              onChange={(event) => {
                setMetal(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('common.filters.allMetals')}</option>
              <option value="GOLD">{t('common.metals.gold')}</option>
              <option value="SILVER">{t('common.metals.silver')}</option>
            </select>
          </label>
        </div>
        {bookLoading ? (
          <div className="empty-state rate-empty" role="status">
            <span className="loading-dot" />
            <p>{t('rates.book.loadingTheRateBook')}</p>
          </div>
        ) : bookError ? (
          <div className="empty-state rate-empty">
            <h3>{t('rates.book.rateBookCouldnTLoad')}</h3>
            <p className="error" role="alert">
              {message(bookError)}
            </p>
            <button className="button secondary" onClick={refresh}>
              {t('common.actions.tryAgain')}
            </button>
          </div>
        ) : book?.rates.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('common.labels.metalPurity')}</th>
                  <th className="numeric">{t('rates.book.buyingTola')}</th>
                  <th className="numeric">{t('rates.book.sellingTola')}</th>
                  <th>{t('rates.book.sourceSaved')}</th>
                  <th>
                    <span className="sr-only">
                      {t('common.labels.actions')}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {book.rates.map((rate) => (
                  <tr key={rate.id}>
                    <td>
                      <span
                        className={`metal-badge ${rate.metal.toLowerCase()}`}
                      >
                        {rate.metal === 'GOLD'
                          ? t('common.labels.gold')
                          : t('common.labels.silver')}
                      </span>
                      <strong className="rate-purity">{rate.fineness}‰</strong>
                      <small className="rate-subline">
                        {t('common.labels.revision') + ' '}
                        {rate.revision}
                      </small>
                    </td>
                    <td className="numeric rate-amount">
                      <small>{t('common.money.currency') + ' '}</small>
                      {npr(rate.buyRatePerTola)}
                      <span>
                        ≈ {ratePerGram(rate.buyRatePerTola, rate.gramsPerTola)}{' '}
                        / {t('common.units.grams')}
                      </span>
                    </td>
                    <td className="numeric rate-amount">
                      <small>{t('common.money.currency') + ' '}</small>
                      {npr(rate.sellRatePerTola)}
                      <span>
                        ≈ {ratePerGram(rate.sellRatePerTola, rate.gramsPerTola)}{' '}
                        / {t('common.units.grams')}
                      </span>
                    </td>
                    <td className="rate-source">
                      {rate.source}
                      <span className="rate-subline">
                        <TimeValue value={rate.createdAt} />
                      </span>
                    </td>
                    <td>
                      <Permission name="rates.write">
                        <button
                          className="button secondary compact"
                          aria-label={t('rates.book.reviseQuote', {
                            metal: rate.metal.toLowerCase(),
                            purity: rate.fineness,
                          })}
                          onClick={() => {
                            setForm({ rate });
                            setNotice('');
                          }}
                        >
                          {t('rates.book.revise')}
                        </button>
                      </Permission>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state rate-empty">
            <span className="empty-icon">
              <Icon name="diamond" size={30} />
            </span>
            <h3>{t('rates.book.noRatesRecordedForThisDate')}</h3>
            <p>{t('rates.book.setAQuoteForEachMetalAndPurity')}</p>
            <Permission name="rates.write">
              <button
                className="button secondary"
                disabled={!date || date > today}
                onClick={() => setForm({})}
              >
                <Icon name="plus" size={17} />
                {t('rates.book.setFirstRate')}
              </button>
            </Permission>
          </div>
        )}
      </section>
      <section
        className="stock-panel rate-history-panel"
        aria-labelledby="rate-history-title"
        aria-busy={historyLoading}
      >
        <div className="stock-heading">
          <div>
            <h2 id="rate-history-title">
              {t('rates.book.rateHistory') + ' '}
              <span>{history?.total ?? '—'}</span>
            </h2>
          </div>
          <Icon name="history" size={19} />
        </div>
        <div className="toolbar rate-toolbar history-toolbar">
          <label className="date-filter">
            {t('common.labels.fromAd')}
            <input
              aria-label={t('rates.book.historyStartDate')}
              type="date"
              min="2000-01-01"
              max={to || today}
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="date-filter">
            {t('common.labels.toAd')}
            <input
              aria-label={t('rates.book.historyEndDate')}
              type="date"
              min={from || '2000-01-01'}
              max={today}
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
          {(from || to) && (
            <button
              className="text-button"
              onClick={() => {
                setFrom('');
                setTo('');
                setPage(1);
              }}
            >
              {t('common.labels.clearDates')}
            </button>
          )}
        </div>
        {historyLoading ? (
          <div className="history-placeholder" role="status">
            {t('rates.book.loadingRateHistory')}
          </div>
        ) : historyError ? (
          <div className="history-placeholder error" role="alert">
            {message(historyError)}{' '}
            <button className="text-button" onClick={refresh}>
              {t('common.actions.tryAgain')}
            </button>
          </div>
        ) : history?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('rates.book.datePurity')}</th>
                  <th className="numeric">{t('rates.book.buyingTola')}</th>
                  <th className="numeric">{t('rates.book.sellingTola')}</th>
                  <th>{t('rates.book.revisionReason')}</th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((rate) => (
                  <tr key={rate.id}>
                    <td>
                      <strong className="history-date">
                        <DateValue value={rate.rateDate} />
                      </strong>
                      <span className="rate-subline">
                        {rate.metal === 'GOLD'
                          ? t('common.metals.gold')
                          : t('common.metals.silver')}{' '}
                        · {rate.fineness}‰
                      </span>
                    </td>
                    <td className="numeric">
                      {t('common.money.currency') + ' '}
                      {npr(rate.buyRatePerTola)}
                    </td>
                    <td className="numeric">
                      {t('common.money.currency') + ' '}
                      {npr(rate.sellRatePerTola)}
                    </td>
                    <td className="history-reason">
                      <strong>
                        {t('common.labels.revision') + ' '}
                        {rate.revision}
                      </strong>
                      <span>{rate.reason || t('rates.book.initialRate')}</span>
                      <small>
                        {rate.source} ·{' '}
                        <TimeValue value={rate.createdAt} />{' '}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="history-placeholder">
            {t('rates.book.noRateHistory')}{' '}
            {from || to || metal
              ? t('rates.book.matchesTheseFilters')
              : t('rates.book.yet')}
            {t('rates.book.savedQuotesWillAppearHere')}
          </div>
        )}
        <div className="table-footer">
          <span>
            {history
              ? t('rates.book.recorded', {
                  count: history.total,
                  unit: t(
                    history.total === 1
                      ? 'rates.book.entry'
                      : 'rates.book.entries',
                  ),
                })
              : t('rates.book.rateHistory')}
          </span>
          <Pagination
            page={page}
            pageSize={history?.pageSize ?? 15}
            total={history?.total}
            loading={historyLoading}
            onPageChange={setPage}
          />
        </div>
      </section>
      {form && (
        <RateForm
          date={date}
          initialMetal={metal === 'SILVER' ? 'SILVER' : 'GOLD'}
          {...(form.rate ? { rate: form.rate } : {})}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
            setPage(1);
            setNotice('Rate saved. The rate book and history are up to date.');
          }}
        />
      )}
    </AppShell>
  );
}
