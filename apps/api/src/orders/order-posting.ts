import type pg from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { orderRecordSchema, type OrderRecord } from '@awesomejm/contracts';
import { SHOP_ID } from '../shop/shop.js';

export const orderColumns = `o.id,o.order_code AS "orderCode",o.customer_id AS "customerId",o.customer_snapshot AS "customerSnapshot",o.order_date::text AS "orderDate",o.due_date::text AS "dueDate",o.lines,o.piece_count AS "pieceCount",o.estimated_total_npr AS "estimatedTotalNpr",o.notes,e.status,e.version,
  GREATEST(o.order_date,e.event_date,p.latest_date)::text AS "latestActivityDate",CASE WHEN e.status='DELIVERED' THEN e.sale_id ELSE NULL END AS "activeSaleId",COALESCE(-p.net_payments,0.00)::text AS "taggedPaymentsNpr",
  (o.due_date < (now() AT TIME ZONE 'Asia/Kathmandu')::date AND e.status NOT IN ('DELIVERED','CANCELLED')) AS overdue,to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`;
export const orderFrom = `custom_orders o JOIN LATERAL (SELECT status,version,event_date,sale_id FROM custom_order_events WHERE shop_id=o.shop_id AND order_id=o.id ORDER BY version DESC LIMIT 1) e ON true LEFT JOIN LATERAL (SELECT sum(amount_npr) AS net_payments,max(entry_date) AS latest_date FROM customer_account_entries WHERE shop_id=o.shop_id AND order_id=o.id) p ON true`;
export const orderHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function loadOrder(
  client: pg.PoolClient,
  id: string,
  lock = false,
): Promise<OrderRecord> {
  if (lock) {
    const found = await client.query(
      'SELECT id FROM custom_orders WHERE shop_id=$1 AND id=$2 FOR UPDATE',
      [SHOP_ID, id],
    );
    if (!found.rowCount) throw new NotFoundException('Order not found.');
  }
  const result = await client.query(
    `SELECT ${orderColumns} FROM ${orderFrom} WHERE o.shop_id=$1 AND o.id=$2`,
    [SHOP_ID, id],
  );
  if (!result.rowCount) throw new NotFoundException('Order not found.');
  return orderRecordSchema.parse(result.rows[0]);
}
export async function appendOrderEvent(
  client: pg.PoolClient,
  order: Pick<OrderRecord, 'id' | 'version'>,
  input: {
    kind: 'STATUS' | 'SALE_DELIVERED' | 'SALE_REOPENED';
    status: OrderRecord['status'];
    eventDate: string;
    reason: string;
    saleId: string | null;
    requestId: string;
    fingerprint: string;
  },
) {
  await client.query(
    `INSERT INTO custom_order_events(id,shop_id,order_id,version,kind,status,event_date,reason,sale_id,request_id,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      randomUUID(),
      SHOP_ID,
      order.id,
      order.version + 1,
      input.kind,
      input.status,
      input.eventDate,
      input.reason,
      input.saleId,
      input.requestId,
      input.fingerprint,
    ],
  );
}
export async function validateOrderDelivery(
  client: pg.PoolClient,
  orderId: string,
  customerId: string,
  lines: { metal: string; fineness: string }[],
  date: string,
  lock: boolean,
) {
  const order = await loadOrder(client, orderId, lock);
  if (order.customerId !== customerId)
    throw new ConflictException(
      'The sale customer must match the order customer.',
    );
  if (order.status !== 'READY')
    throw new ConflictException(
      'Only a ready order can be delivered through Sales. Refresh the order.',
    );
  if (date < order.latestActivityDate)
    throw new BadRequestException(
      `Delivery must be on or after ${order.latestActivityDate}.`,
    );
  const expected = new Map<string, number>(),
    actual = new Map<string, number>();
  for (const line of order.lines) {
    const key = `${line.metal}:${line.fineness}`;
    expected.set(key, (expected.get(key) ?? 0) + line.quantity);
  }
  for (const line of lines) {
    const key = `${line.metal}:${line.fineness}`;
    actual.set(key, (actual.get(key) ?? 0) + 1);
  }
  if (
    expected.size !== actual.size ||
    [...expected].some(([key, quantity]) => actual.get(key) !== quantity)
  )
    throw new ConflictException(
      'Select all ordered pieces with their specified metal and purity. Partial deliveries are not supported.',
    );
  return order;
}
