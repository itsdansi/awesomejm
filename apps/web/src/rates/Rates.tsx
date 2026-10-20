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
  new Intl.NumberFormat('en-NP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
const time = (value: string) =>
  new Date(value).toLocaleString('en-NP', {
    timeZone: 'Asia/Kathmandu',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function Rates() {
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
          <p className="eyebrow">A CLEAR RECORD OF EVERY QUOTE</p>
          <h1>
            Gold & silver rates<span>.</span>
          </h1>
          <p className="description">
            Your shop’s buying and selling rates, with every revision preserved.
          </p>
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
            Set a rate
          </button>
        </Permission>
      </div>
      <div className="rate-intro">
        <div>
          <span className="rate-intro-icon">
            <Icon name="diamond" size={23} />
          </span>
          <div>
            <strong>Your shop’s rate book</strong>
            <p>Manual quotes in NPR per tola · 1 tola = 11.664 g</p>
          </div>
        </div>
        <span className="manual-badge">MANUAL ENTRY</span>
      </div>
      {notice && (
        <div className="success" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss message"
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
              Daily rate book <span>{book?.rates.length ?? '—'}</span>
            </h2>
            <p>Latest revision for each purity on the selected date.</p>
          </div>
          <button className="text-button" onClick={refresh}>
            Refresh
          </button>
        </div>
        <div className="toolbar rate-toolbar">
          <label className="date-filter">
            Rate date (AD)
            <input
              aria-label="Rate book date"
              type="date"
              min="2000-01-01"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <button className="text-button" onClick={() => setDate(nepalToday())}>
            Today
          </button>
          <label className="filter-label">
            <span className="sr-only">Filter by metal</span>
            <select
              aria-label="Filter by metal"
              value={metal}
              onChange={(event) => {
                setMetal(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All metals</option>
              <option value="GOLD">Gold</option>
              <option value="SILVER">Silver</option>
            </select>
          </label>
        </div>
        {bookLoading ? (
          <div className="empty-state rate-empty" role="status">
            <span className="loading-dot" />
            <p>Loading the rate book…</p>
          </div>
        ) : bookError ? (
          <div className="empty-state rate-empty">
            <h3>Rate book couldn’t load</h3>
            <p className="error" role="alert">
              {bookError}
            </p>
            <button className="button secondary" onClick={refresh}>
              Try again
            </button>
          </div>
        ) : book?.rates.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Metal & purity</th>
                  <th className="numeric">Buying / tola</th>
                  <th className="numeric">Selling / tola</th>
                  <th>Source / saved</th>
                  <th>
                    <span className="sr-only">Actions</span>
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
                          ? 'Gold · सुन'
                          : 'Silver · चाँदी'}
                      </span>
                      <strong className="rate-purity">{rate.fineness}‰</strong>
                      <small className="rate-subline">
                        Revision {rate.revision}
                      </small>
                    </td>
                    <td className="numeric rate-amount">
                      <small>NPR </small>
                      {npr(rate.buyRatePerTola)}
                      <span>
                        ≈ {ratePerGram(rate.buyRatePerTola, rate.gramsPerTola)}{' '}
                        / g
                      </span>
                    </td>
                    <td className="numeric rate-amount">
                      <small>NPR </small>
                      {npr(rate.sellRatePerTola)}
                      <span>
                        ≈ {ratePerGram(rate.sellRatePerTola, rate.gramsPerTola)}{' '}
                        / g
                      </span>
                    </td>
                    <td className="rate-source">
                      {rate.source}
                      <time className="rate-subline" dateTime={rate.createdAt}>
                        {time(rate.createdAt)} NPT
                      </time>
                    </td>
                    <td>
                      <Permission name="rates.write">
                        <button
                          className="button secondary compact"
                          aria-label={`Revise ${rate.metal.toLowerCase()} ${rate.fineness}`}
                          onClick={() => {
                            setForm({ rate });
                            setNotice('');
                          }}
                        >
                          Revise
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
            <h3>No rates recorded for this date</h3>
            <p>
              Set a quote for each metal and purity you trade. Previous dates
              are available in history.
            </p>
            <Permission name="rates.write">
              <button
                className="button secondary"
                disabled={!date || date > today}
                onClick={() => setForm({})}
              >
                <Icon name="plus" size={17} />
                Set first rate
              </button>
            </Permission>
          </div>
        )}
        <div className="rate-book-footnote">
          Quotes apply to their stated purity. Per-gram values are rounded
          previews.
        </div>
      </section>
      <section
        className="stock-panel rate-history-panel"
        aria-labelledby="rate-history-title"
        aria-busy={historyLoading}
      >
        <div className="stock-heading">
          <div>
            <h2 id="rate-history-title">
              Rate history <span>{history?.total ?? '—'}</span>
            </h2>
            <p>Original entries and every subsequent revision.</p>
          </div>
          <Icon name="history" size={19} />
        </div>
        <div className="toolbar rate-toolbar history-toolbar">
          <label className="date-filter">
            From (AD)
            <input
              aria-label="History start date"
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
            To (AD)
            <input
              aria-label="History end date"
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
              Clear dates
            </button>
          )}
        </div>
        {historyLoading ? (
          <div className="history-placeholder" role="status">
            Loading rate history…
          </div>
        ) : historyError ? (
          <div className="history-placeholder error" role="alert">
            {historyError}{' '}
            <button className="text-button" onClick={refresh}>
              Try again
            </button>
          </div>
        ) : history?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date / purity</th>
                  <th className="numeric">Buying / tola</th>
                  <th className="numeric">Selling / tola</th>
                  <th>Revision / reason</th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((rate) => (
                  <tr key={rate.id}>
                    <td>
                      <strong className="history-date">{rate.rateDate}</strong>
                      <span className="rate-subline">
                        {rate.metal === 'GOLD' ? 'Gold' : 'Silver'} ·{' '}
                        {rate.fineness}‰
                      </span>
                    </td>
                    <td className="numeric">NPR {npr(rate.buyRatePerTola)}</td>
                    <td className="numeric">NPR {npr(rate.sellRatePerTola)}</td>
                    <td className="history-reason">
                      <strong>Revision {rate.revision}</strong>
                      <span>{rate.reason || 'Initial rate'}</span>
                      <small>
                        {rate.source} · {time(rate.createdAt)} NPT
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="history-placeholder">
            No rate history{' '}
            {from || to || metal ? 'matches these filters' : 'yet'}. Saved
            quotes will appear here.
          </div>
        )}
        <div className="table-footer">
          <span>
            {history
              ? `${history.total} recorded ${history.total === 1 ? 'entry' : 'entries'}`
              : 'Rate history'}
          </span>
          <div className="pagination">
            <button
              aria-label="Previous history page"
              disabled={page === 1 || historyLoading}
              onClick={() => setPage((value) => value - 1)}
            >
              ‹
            </button>
            <span>Page {page}</span>
            <button
              aria-label="Next history page"
              disabled={
                !history ||
                page * history.pageSize >= history.total ||
                historyLoading
              }
              onClick={() => setPage((value) => value + 1)}
            >
              ›
            </button>
          </div>
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
