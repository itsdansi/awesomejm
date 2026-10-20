import type { StaticTranslationKey } from '../i18n/schema';
import type { OrderRecord } from '@awesomejm/contracts';
export const statusTitle: Record<OrderRecord['status'], StaticTranslationKey> =
  {
    BOOKED: 'orders.labels.booked',
    IN_PROGRESS: 'orders.format.inProgress',
    READY: 'common.labels.ready',
    DELIVERED: 'orders.format.delivered',
    CANCELLED: 'common.status.cancelled',
  };
export const statusClass = (status: OrderRecord['status']) =>
  `status order-status ${status.toLowerCase()}`;
