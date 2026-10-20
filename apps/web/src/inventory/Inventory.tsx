import { Pagination } from '../shared/Pagination';
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
          <h1>
            {t('inventory.title')}
            <span>.</span>
          </h1>
          <p className="description">{t('inventory.list.description')}</p>
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
            {t('inventory.receiveForm.title')}
          </button>
        </Permission>
      </div>
      <section
        className="summary-cards"
        aria-label={t('inventory.list.availableStockTotals')}
      >
        <article className="summary-card">
          <div className="summary-top">
            <span>{t('inventory.list.totalAvailable')}</span>
            <span className="summary-icon neutral">
              <Icon name="box" />
            </span>
          </div>
          <strong>
            {data ? totalPieces : '—'}
            <small>{t('common.labels.pieces')}</small>
          </strong>
          <p>{t('inventory.list.readyMadeJewelleryInStock')}</p>
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
                  {kind === 'GOLD'
                    ? t('common.labels.gold')
                    : t('common.labels.silver')}
                </span>
                <span className={`summary-icon ${kind.toLowerCase()}`}>
                  <Icon name="diamond" />
                </span>
              </div>
              <strong>
                {data ? (row?.netWeightGrams ?? '0.000') : '—'}
                <small>{t('common.units.grams')}</small>
              </strong>
              <p>
                {data ? (row?.pieces ?? 0) : '—'}{' '}
                {' ' + t('common.labels.pieces') + ' '}
                <span>·</span> {' ' + t('inventory.labels.netMetalWeight')}
              </p>
            </article>
          );
        })}
      </section>
      <div className="weight-note">
        <span>{t('inventory.list.weightConvention')}</span>
        {t('inventory.list.tolaConversion')}{' '}
        <span className="note-divider">/</span>{' '}
        {' ' + t('inventory.list.netWeightHelp')}
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
        aria-labelledby="stock-title"
        aria-busy={loading}
      >
        <div className="stock-heading">
          <div>
            <h2 id="stock-title">
              {t('inventory.list.stockRegister') + ' '}
              <span>{data?.list.total ?? '—'}</span>
            </h2>
            <p>
              {t('inventory.list.individualPiecesWithAPermanentReceiptHistory')}
            </p>
          </div>
        </div>
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <input
              aria-label={t('inventory.list.searchInventory')}
              placeholder={t('inventory.list.searchCodeNameOrCategory')}
              maxLength={120}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="filter-label">
            <span className="sr-only">{t('common.labels.filterByMetal')}</span>
            <select
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
          <label className="filter-label">
            <span className="sr-only">{t('inventory.list.receiptStatus')}</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="AVAILABLE">
                {t('inventory.list.availableStock')}
              </option>
              <option value="SOLD">{t('inventory.list.soldPieces')}</option>
              <option value="VOIDED">
                {t('inventory.list.voidedReceipts')}
              </option>
            </select>
          </label>
        </div>
        {error ? (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="box" size={30} />
            </span>
            <h3>{t('inventory.list.inventoryCouldnTLoad')}</h3>
            <p className="error" role="alert">
              {message(error)}
            </p>
            <button
              className="button secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              {t('common.actions.tryAgain')}
            </button>
          </div>
        ) : loading ? (
          <div className="empty-state" role="status">
            <span className="loading-dot" />
            <p>{t('inventory.list.loadingYourStockRegister')}</p>
          </div>
        ) : data?.list.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('inventory.list.pieceItemCode')}</th>
                  <th>{t('common.labels.metalPurity')}</th>
                  <th>{t('inventory.labels.category')}</th>
                  <th className="numeric">{t('inventory.list.netWeight')}</th>
                  <th className="numeric">{t('inventory.list.tola')}</th>
                  <th>
                    <span className="sr-only">
                      {t('common.labels.details')}
                    </span>
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
                        {item.metal === 'GOLD'
                          ? t('common.metals.gold')
                          : t('common.metals.silver')}
                      </span>
                      <span className="purity">{item.fineness}‰</span>
                    </td>
                    <td className="muted">{item.category}</td>
                    <td className="numeric weight-cell">
                      {item.netWeightGrams}
                      <small> {' ' + t('common.units.grams')}</small>
                    </td>
                    <td className="numeric muted">
                      {gramsToTola(item.netWeightGrams, item.gramsPerTola)}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={t('common.actions.viewRecord', {
                          code: item.itemCode,
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
                ? t('inventory.list.noMatchingPieces')
                : t('inventory.list.emptyTitle')}
            </h3>
            <p>
              {searchTerm || metal || status !== 'AVAILABLE'
                ? t('inventory.list.tryAnotherSearchOrChangeYourFilters')
                : t('inventory.list.emptyDescription')}
            </p>
            {!searchTerm && !metal && status === 'AVAILABLE' && (
              <Permission name="inventory.write">
                <button
                  className="button secondary"
                  onClick={() => setReceiving(true)}
                >
                  <Icon name="plus" size={17} />
                  {t('inventory.list.receiveFirstPiece')}
                </button>
              </Permission>
            )}
          </div>
        )}
        <div className="table-footer">
          <span>
            {data && !loading
              ? t('inventory.list.resultCount', {
                  count: data.list.total,
                  unit: t(
                    data.list.total === 1
                      ? 'common.labels.piece'
                      : 'common.labels.pieces',
                  ),
                  status:
                    status === 'AVAILABLE'
                      ? t('inventory.list.availableStock')
                      : status === 'SOLD'
                        ? t('inventory.list.soldPieces')
                        : t('inventory.list.voidedReceipts'),
                })
              : t('inventory.list.stockRegister')}
          </span>
          <Pagination
            page={page}
            pageSize={data?.list.pageSize ?? 15}
            total={data?.list.total}
            loading={loading}
            onPageChange={setPage}
          />
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
