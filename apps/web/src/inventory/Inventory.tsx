import { t, message, useLanguage } from '../i18n/language';
import { Permission } from '../auth/Permission';
import { AppShell } from '../shared/AppShell';
import { useEffect, useState } from 'react';
import { gramsToTola } from '@awesomejm/calculations';
import {
  inventoryListSchema,
  inventorySummarySchema,
  type InventoryItem,
  type InventoryList,
  type InventorySummary,
} from '@awesomejm/contracts';
import { errorMessage, request } from './api';
import { ReceiveForm } from './ReceiveForm';
import { ItemDetails } from './ItemDetails';
import { Icon } from './ui';

export function Inventory() {
  useLanguage();

  const [result, setResult] = useState<{
    key: string;
    data: { list: InventoryList; summary: InventorySummary } | null;
    error: string;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [metal, setMetal] = useState('');
  const [status, setStatus] = useState('AVAILABLE');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const requestKey = JSON.stringify([
    searchTerm,
    metal,
    status,
    page,
    revision,
  ]);
  const loading = result?.key !== requestKey;
  const data = loading ? null : (result?.data ?? null);
  const error = loading ? '' : (result?.error ?? '');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      search: searchTerm,
      status,
      page: String(page),
      pageSize: '15',
      ...(metal ? { metal } : {}),
    });
    void Promise.all([
      request(`/items?${query}`, inventoryListSchema, {
        signal: controller.signal,
      }),
      request('/summary', inventorySummarySchema, {
        signal: controller.signal,
      }),
    ])
      .then(([list, summary]) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, data: { list, summary }, error: '' });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            key: requestKey,
            data: null,
            error: errorMessage(error),
          });
        }
      });
    return () => controller.abort();
  }, [searchTerm, metal, status, page, requestKey]);
  function saved(message: string) {
    setReceiving(false);
    setSelected(null);
    setRevision((value) => value + 1);
    setNotice(message);
    setPage(1);
  }
  const totalPieces = data?.summary.metals.reduce(
    (sum, row) => sum + row.pieces,
    0,
  );
  return (
    <AppShell section="Inventory">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('YOUR STOCK, AT A GLANCE')}</p>
          <h1>
            {t('Jewellery inventory')}
            <span>.</span>
          </h1>
          <p className="description">
            {t('Every piece accounted for. Every gram in its place.')}
          </p>
        </div>
        <Permission name="inventory.write">
          <button
            className="button primary"
            onClick={() => {
              setReceiving(true);
              setNotice('');
            }}
          >
            <Icon name="plus" size={18} />
            {t('Receive a piece')}
          </button>
        </Permission>
      </div>
      <section
        className="summary-cards"
        aria-label={t('Available stock totals')}
      >
        <article className="summary-card">
          <div className="summary-top">
            <span>{t('Total available')}</span>
            <span className="summary-icon neutral">
              <Icon name="box" />
            </span>
          </div>
          <strong>
            {data ? totalPieces : '—'}
            <small>{t('pieces')}</small>
          </strong>
          <p>{t('Ready-made jewellery in stock')}</p>
        </article>
        {(['GOLD', 'SILVER'] as const).map((kind) => {
          const row = data?.summary.metals.find((row) => row.metal === kind);
          return (
            <article
              className={`summary-card ${kind.toLowerCase()}-card`}
              key={kind}
            >
              <div className="summary-top">
                <span>
                  {kind === 'GOLD' ? t('Gold · सुन') : t('Silver · चाँदी')}
                </span>
                <span className={`summary-icon ${kind.toLowerCase()}`}>
                  <Icon name="diamond" />
                </span>
              </div>
              <strong>
                {data ? (row?.netWeightGrams ?? '0.000') : '—'}
                <small>{t('g')}</small>
              </strong>
              <p>
                {data ? (row?.pieces ?? 0) : '—'} {t(' pieces ')}
                <span>·</span> {t(' Net metal weight')}
              </p>
            </article>
          );
        })}
      </section>
      <div className="weight-note">
        <span>{t('WEIGHT CONVENTION')}</span>
        {t('1 tola = 11.664 g')} <span className="note-divider">/</span>{' '}
        {t(' Stones and other materials excluded from net weight.')}
      </div>
      {notice && (
        <div className="success" role="status">
          {message(notice)}
          <button
            className="icon-button"
            aria-label={t('Dismiss message')}
            onClick={() => setNotice('')}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <section
        className="stock-panel"
        aria-labelledby="stock-title"
        aria-busy={loading}
      >
        <div className="stock-heading">
          <div>
            <h2 id="stock-title">
              {t('Stock register ')}
              <span>{data?.list.total ?? '—'}</span>
            </h2>
            <p>{t('Individual pieces, with a permanent receipt history.')}</p>
          </div>
          <span className="register-label">{t('INVENTORY / 01')}</span>
        </div>
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              aria-label={t('Search inventory')}
              placeholder={t('Search code, name or category…')}
              maxLength={120}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">{t('Filter by metal')}</span>
            <select
              value={metal}
              onChange={(event) => {
                setMetal(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('All metals')}</option>
              <option value="GOLD">{t('Gold')}</option>
              <option value="SILVER">{t('Silver')}</option>
            </select>
          </label>
          <label className="filter-label">
            <span className="sr-only">{t('Receipt status')}</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="AVAILABLE">{t('Available stock')}</option>
              <option value="SOLD">{t('Sold pieces')}</option>
              <option value="VOIDED">{t('Voided receipts')}</option>
            </select>
          </label>
        </div>
        {error ? (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="box" size={30} />
            </span>
            <h3>{t('Inventory couldn’t load')}</h3>
            <p className="error" role="alert">
              {message(error)}
            </p>
            <button
              className="button secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('Try again')}
            </button>
          </div>
        ) : loading ? (
          <div className="empty-state" role="status">
            <span className="loading-dot" />
            <p>{t('Loading your stock register…')}</p>
          </div>
        ) : data?.list.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('Piece / item code')}</th>
                  <th>{t('Metal & purity')}</th>
                  <th>{t('Category')}</th>
                  <th className="numeric">{t('Net weight')}</th>
                  <th className="numeric">{t('Tola')}</th>
                  <th>
                    <span className="sr-only">{t('Details')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.list.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button
                        className="item-link"
                        onClick={() => setSelected(item)}
                      >
                        {item.name}
                      </button>
                      <code>{item.itemCode}</code>
                    </td>
                    <td>
                      <span
                        className={`metal-badge ${item.metal.toLowerCase()}`}
                      >
                        {item.metal === 'GOLD' ? t('Gold') : t('Silver')}
                      </span>
                      <span className="purity">{item.fineness}‰</span>
                    </td>
                    <td className="muted">{item.category}</td>
                    <td className="numeric weight-cell">
                      {item.netWeightGrams}
                      <small> {t(' g')}</small>
                    </td>
                    <td className="numeric muted">
                      {gramsToTola(item.netWeightGrams, item.gramsPerTola)}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={t('View {value0}', {
                          value0: item.itemCode,
                        })}
                        onClick={() => setSelected(item)}
                      >
                        <Icon name="arrow" size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="box" size={32} />
            </span>
            <h3>
              {searchTerm || metal || status !== 'AVAILABLE'
                ? t('No matching pieces')
                : t('Your stock register starts here')}
            </h3>
            <p>
              {searchTerm || metal || status !== 'AVAILABLE'
                ? t('Try another search or change your filters.')
                : t(
                    'Receive your first gold or silver piece to start tracking your inventory.',
                  )}
            </p>
            {!searchTerm && !metal && status === 'AVAILABLE' && (
              <Permission name="inventory.write">
                <button
                  className="button secondary"
                  onClick={() => setReceiving(true)}
                >
                  <Icon name="plus" size={17} />
                  {t('Receive first piece')}
                </button>
              </Permission>
            )}
          </div>
        )}
        <div className="table-footer">
          <span>
            {data && !loading
              ? t('{value0} {value1} · {value2}', {
                  value0: data.list.total,
                  value1: t(data.list.total === 1 ? 'piece' : 'pieces'),
                  value2:
                    status === 'AVAILABLE'
                      ? t('Available stock')
                      : status === 'SOLD'
                        ? t('Sold pieces')
                        : t('Voided receipts'),
                })
              : t('Stock register')}
          </span>
          <div className="pagination">
            <button
              aria-label={t('Previous page')}
              disabled={page === 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              ‹
            </button>
            <span>
              {t('Page ')}
              {page}
            </span>
            <button
              aria-label={t('Next page')}
              disabled={
                !data || page * data.list.pageSize >= data.list.total || loading
              }
              onClick={() => setPage((value) => value + 1)}
            >
              ›
            </button>
          </div>
        </div>
      </section>
      {receiving && (
        <ReceiveForm
          onClose={() => setReceiving(false)}
          onSaved={() =>
            saved('Piece received. Your stock register is up to date.')
          }
        />
      )}
      {selected && (
        <ItemDetails
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={() =>
            saved(
              'Receipt voided. The correction is recorded in stock history.',
            )
          }
        />
      )}
    </AppShell>
  );
}
