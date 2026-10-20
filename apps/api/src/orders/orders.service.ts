import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  orderDetailSchema,
  ordersListSchema,
  ordersSummarySchema,
  type CreateOrder,
  type OrderPayment,
  type OrdersQuery,
  type UpdateOrderStatus,
  type Customer,
} from '@awesomejm/contracts';
import { DatabaseService } from '../database/database.service.js';
import { customerSnapshot, loadCustomer } from '../customers/accounting.js';
import { SHOP_ID } from '../shop/shop.js';
import { nextShopNumber } from '../shop/counters.js';
import {
  appendOrderEvent,
  loadOrder,
  orderColumns,
  orderFrom,
  orderHash,
} from './order-posting.js';

@Injectable()
export class OrdersService {
  constructor(private readonly database: DatabaseService) {}
  private async detail(client: pg.PoolClient, id: string) {
    const order = await loadOrder(client, id);
    const customer = await loadCustomer(client, order.customerId);
    const events = await client.query(
      `SELECT id,version,kind,status,event_date::text AS "eventDate",reason,sale_id AS "saleId",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM custom_order_events WHERE shop_id=$1 AND order_id=$2 ORDER BY version`,
      [SHOP_ID, id],
    );
    const payments = await client.query(
      `SELECT a.id,a.entry_code AS "entryCode",a.entry_date::text AS "entryDate",a.kind,a.amount_npr AS "amountNpr",a.method,a.reference,a.notes,EXISTS(SELECT 1 FROM customer_account_entries r WHERE r.shop_id=a.shop_id AND r.reversal_of=a.id) AS reversed FROM customer_account_entries a WHERE a.shop_id=$1 AND a.order_id=$2 ORDER BY a.entry_number DESC`,
      [SHOP_ID, id],
    );
    return orderDetailSchema.parse({
      order,
      customer,
      events: events.rows,
      payments: payments.rows,
    });
  }
  async get(id: string) {
    return this.database.run(async (client) => {
      await client.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      return this.detail(client, id);
    }, true);
  }
  async list(query: OrdersQuery) {
    return this.database.run(async (client) => {
      const where = `o.shop_id=$1 AND (o.order_code ILIKE $2 OR o.customer_snapshot->>'name' ILIKE $2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(o.lines) line WHERE line->>'name' ILIKE $2 OR line->>'design' ILIKE $2)) AND ($3='ALL' OR ($3='ACTIVE' AND e.status NOT IN ('DELIVERED','CANCELLED')) OR e.status=$3) AND ($4::boolean=false OR (o.due_date < (now() AT TIME ZONE 'Asia/Kathmandu')::date AND e.status NOT IN ('DELIVERED','CANCELLED')))`;
      const values = [
        SHOP_ID,
        `%${query.search.replace(/[\\%_]/g, '\\$&')}%`,
        query.status,
        query.overdue === 'true',
      ];
      const result = await client.query(
        `SELECT ${orderColumns},count(*) OVER()::int AS "totalCount" FROM ${orderFrom} WHERE ${where} ORDER BY o.due_date,o.created_at DESC,o.id LIMIT $5 OFFSET $6`,
        [...values, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const total = result.rows.length
        ? result.rows[0].totalCount
        : (
            await client.query(
              `SELECT count(*)::int AS n FROM ${orderFrom} WHERE ${where}`,
              values,
            )
          ).rows[0].n;
      return ordersListSchema.parse({
        items: result.rows,
        total,
        page: query.page,
        pageSize: query.pageSize,
      });
    });
  }
  async summary() {
    return this.database.run(async (client) => {
      const result = await client.query(
        `SELECT count(*) FILTER(WHERE e.status NOT IN ('DELIVERED','CANCELLED'))::int AS active,count(*) FILTER(WHERE e.status='READY')::int AS ready,count(*) FILTER(WHERE e.status NOT IN ('DELIVERED','CANCELLED') AND o.due_date < (now() AT TIME ZONE 'Asia/Kathmandu')::date)::int AS overdue FROM ${orderFrom} WHERE o.shop_id=$1`,
        [SHOP_ID],
      );
      return ordersSummarySchema.parse(result.rows[0]);
    });
  }
  private async paymentEntry(
    client: pg.PoolClient,
    customer: Customer,
    orderId: string,
    orderCode: string,
    input: OrderPayment,
  ) {
    const entry = await nextShopNumber(client, 'ACCOUNT_ENTRY');
    await client.query(
      `INSERT INTO customer_account_entries(id,shop_id,customer_id,entry_number,entry_code,entry_date,kind,amount_npr,method,reference,notes,customer_snapshot,request_id,request_fingerprint,order_id) VALUES($1,$2,$3,$4,$5,$6,'PAYMENT',-$7::numeric,$8,$9,$10,$11,$12,$13,$14)`,
      [
        randomUUID(),
        SHOP_ID,
        customer.id,
        entry.number,
        entry.code,
        input.entryDate,
        input.amountNpr,
        input.method,
        input.reference || orderCode,
        input.notes,
        JSON.stringify(customerSnapshot(customer)),
        input.requestId,
        orderHash(['order-payment', orderId, input]),
        orderId,
      ],
    );
  }
  async create(input: CreateOrder) {
    return this.database.run(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`order-create:${SHOP_ID}:${input.requestId}`],
      );
      const fingerprint = orderHash(input);
      const existing = await client.query(
        'SELECT id,request_fingerprint FROM custom_orders WHERE shop_id=$1 AND request_id=$2',
        [SHOP_ID, input.requestId],
      );
      if (existing.rowCount) {
        if (existing.rows[0].request_fingerprint !== fingerprint)
          throw new ConflictException(
            'This request was already used for a different order. Check the register.',
          );
        return this.detail(client, existing.rows[0].id);
      }
      const customer = await loadCustomer(client, input.customerId, true);
      if (input.orderDate < customer.openedOn)
        throw new BadRequestException(
          'Order date cannot precede the customer account opening date.',
        );
      const hasDeposit = Number(input.deposit.amountNpr) > 0;
      if (hasDeposit && input.orderDate < customer.latestEntryDate)
        throw new BadRequestException(
          `Record the advance on or after ${customer.latestEntryDate}. Create the earlier order without an advance and record the payment separately.`,
        );
      const id = randomUUID(),
        code = await nextShopNumber(client, 'ORDER');
      await client.query(
        `INSERT INTO custom_orders(id,shop_id,customer_id,order_code,order_date,due_date,customer_snapshot,lines,piece_count,estimated_total_npr,notes,request_id,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          SHOP_ID,
          customer.id,
          code.code,
          input.orderDate,
          input.dueDate,
          JSON.stringify(customerSnapshot(customer)),
          JSON.stringify(input.lines),
          input.lines.reduce((sum, line) => sum + line.quantity, 0),
          input.estimatedTotalNpr,
          input.notes,
          input.requestId,
          fingerprint,
        ],
      );
      await client.query(
        `INSERT INTO custom_order_events(id,shop_id,order_id,version,kind,status,event_date,reason,request_id,request_fingerprint) VALUES($1,$2,$3,1,'CREATED','BOOKED',$4,'Order booked',$5,$6)`,
        [randomUUID(), SHOP_ID, id, input.orderDate, randomUUID(), fingerprint],
      );
      if (hasDeposit)
        await this.paymentEntry(client, customer, id, code.code, {
          requestId: randomUUID(),
          entryDate: input.orderDate,
          amountNpr: input.deposit.amountNpr,
          method: input.deposit.method!,
          reference: input.deposit.reference,
          notes: `Advance received with ${code.code}`,
        });
      return this.detail(client, id);
    }, true);
  }
  async updateStatus(id: string, input: UpdateOrderStatus) {
    return this.database.run(async (client) => {
      const found = await loadOrder(client, id);
      await loadCustomer(client, found.customerId, true);
      const order = await loadOrder(client, id, true),
        fingerprint = orderHash([id, input]);
      const existing = await client.query(
        'SELECT order_id,request_fingerprint FROM custom_order_events WHERE shop_id=$1 AND request_id=$2',
        [SHOP_ID, input.requestId],
      );
      if (existing.rowCount) {
        if (
          existing.rows[0].order_id !== id ||
          existing.rows[0].request_fingerprint !== fingerprint
        )
          throw new ConflictException(
            'This request was already used for another status update.',
          );
        return this.detail(client, id);
      }
      if (order.version !== input.expectedVersion)
        throw new ConflictException(
          'This order has changed. Refresh before updating its status.',
        );
      const transitions: Record<string, string[]> = {
        BOOKED: ['IN_PROGRESS', 'READY', 'CANCELLED'],
        IN_PROGRESS: ['READY', 'CANCELLED'],
        READY: ['IN_PROGRESS', 'CANCELLED'],
      };
      if (!transitions[order.status]?.includes(input.status))
        throw new ConflictException(
          'This status change is not allowed. Delivered orders are corrected through Sales.',
        );
      if (input.eventDate < order.latestActivityDate)
        throw new BadRequestException(
          `Choose a date on or after ${order.latestActivityDate}.`,
        );
      await appendOrderEvent(client, order, {
        kind: 'STATUS',
        status: input.status,
        eventDate: input.eventDate,
        reason: input.reason,
        saleId: null,
        requestId: input.requestId,
        fingerprint,
      });
      return this.detail(client, id);
    }, true);
  }
  async payment(id: string, input: OrderPayment) {
    return this.database.run(async (client) => {
      const found = await loadOrder(client, id),
        customer = await loadCustomer(client, found.customerId, true),
        order = await loadOrder(client, id, true);
      const fingerprint = orderHash(['order-payment', id, input]);
      const existing = await client.query(
        'SELECT order_id,request_fingerprint FROM customer_account_entries WHERE shop_id=$1 AND request_id=$2',
        [SHOP_ID, input.requestId],
      );
      if (existing.rowCount) {
        if (
          existing.rows[0].order_id !== id ||
          existing.rows[0].request_fingerprint !== fingerprint
        )
          throw new ConflictException(
            'This request was already used for a different payment.',
          );
        return this.detail(client, id);
      }
      if (order.status === 'DELIVERED' || order.status === 'CANCELLED')
        throw new ConflictException(
          'This order is closed. Record any subsequent payment in the customer account.',
        );
      const earliest = [order.latestActivityDate, customer.latestEntryDate]
        .sort()
        .at(-1)!;
      if (input.entryDate < earliest)
        throw new BadRequestException(
          `Record this payment on or after ${earliest}.`,
        );
      await this.paymentEntry(client, customer, id, order.orderCode, input);
      return this.detail(client, id);
    }, true);
  }
}
