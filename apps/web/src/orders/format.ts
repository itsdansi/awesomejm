import type { OrderRecord } from '@awesomejm/contracts';
export const statusTitle: Record<OrderRecord['status'], string> = {
  BOOKED: 'Booked',
  IN_PROGRESS: 'In progress',
  READY: 'Ready',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};
export const statusClass = (status: OrderRecord['status']) =>
  `status order-status ${status.toLowerCase()}`;
