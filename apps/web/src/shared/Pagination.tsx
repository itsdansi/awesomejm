import { t, useLanguage } from '../i18n/language';
import { Icon } from './ui';

export function Pagination({
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number | undefined;
  loading?: boolean;
  onPageChange: (page: number) => void;
}) {
  useLanguage();
  const pages =
    total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="pagination" aria-label={t('common.pagination.label')}>
      <button
        type="button"
        aria-label={t('common.pagination.previous')}
        title={t('common.pagination.previous')}
        disabled={loading || page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        <Icon name="chevronLeft" size={16} />
      </button>
      <span className="pagination-status" aria-live="polite" aria-atomic="true">
        {pages === undefined
          ? t('common.pagination.page', { page })
          : t('common.pagination.pageOf', { page, pages })}
      </span>
      <button
        type="button"
        aria-label={t('common.pagination.next')}
        title={t('common.pagination.next')}
        disabled={loading || pages === undefined || page >= pages}
        onClick={() => onPageChange(Math.min(pages ?? page, page + 1))}
      >
        <Icon name="chevronRight" size={16} />
      </button>
    </nav>
  );
}
