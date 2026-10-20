import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type pg from 'pg';
import {
  inventoryItemSchema,
  metalRateSchema,
  saleDetailSchema,
  saleItemSnapshotSchema,
  salePreviewSchema,
  salesListSchema,
  salesSummarySchema,
  type CancelSale,
  type PostSale,
  type SaleDraft,
  type SalesQuery,
  type SalePreview,
} from '@awesomejm/contracts';
import { priceSale } from '@awesomejm/calculations';
import { DatabaseService } from '../database/database.service.js';
import { loadCustomer, customerSnapshot } from '../customers/accounting.js';
import { nextShopNumber } from '../shop/counters.js';
import { SHOP_ID } from '../shop/shop.js';
import { inventoryColumns } from '../inventory/inventory-row.js';
import {
  appendOrderEvent,
  loadOrder,
  validateOrderDelivery,
} from '../orders/order-posting.js';
import { rateColumns } from '../rates/rate-row.js';

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function cents(value: string) {
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  return (
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) *
    (value.startsWith('-') ? -1n : 1n)
  );
}
const columns = `s.id,s.sale_code AS "saleCode",s.order_id AS "orderId",(SELECT id FROM metal_purchases p WHERE p.shop_id=s.shop_id AND p.sale_id=s.id) AS "purchaseId",s.sale_date::text AS "saleDate",s.customer_id AS "customerId",s.customer_snapshot AS "customerSnapshot",
  s.subtotal_npr AS "subtotalNpr",s.discount_npr AS "discountNpr",s.tax_npr AS "taxNpr",s.total_npr AS "totalNpr",s.payment_npr AS "paymentNpr",s.advance_applied_npr AS "advanceAppliedNpr",s.due_at_posting_npr AS "dueAtPostingNpr",s.balance_before_npr AS "balanceBeforeNpr",s.balance_after_npr AS "balanceAfterNpr",
  s.payment_method AS "paymentMethod",s.payment_reference AS "paymentReference",s.bill_reference AS "billReference",s.notes,
  CASE WHEN x.sale_id IS NULL THEN 'POSTED' ELSE 'CANCELLED' END AS status,
  to_char(s.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
  x.cancellation_date::text AS "cancellationDate",x.reason AS "cancellationReason",to_char(x.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "cancelledAt"`;
const from =
  'sales s LEFT JOIN sale_cancellations x ON x.shop_id=s.shop_id AND x.sale_id=s.id';

@Injectable()
export class SalesService {
  constructor(private readonly database: DatabaseService) {}

  async detail(client: pg.PoolClient, id: string) {
    const result = await client.query(
      `SELECT ${columns} FROM ${from} WHERE s.shop_id=$1 AND s.id=$2`,
      [SHOP_ID, id],
    );
    if (!result.rowCount) throw new NotFoundException('Sale not found.');
    const lines = await client.query(
      `SELECT item_snapshot AS item,rate_snapshot AS rate,wastage_grams AS "wastageGrams",metal_npr AS "metalNpr",wastage_npr AS "wastageNpr",making_npr AS "makingNpr",stones_npr AS "stonesNpr",line_total_npr AS "lineTotalNpr" FROM sale_lines WHERE shop_id=$1 AND sale_id=$2 ORDER BY line_number`,
      [SHOP_ID, id],
    );
    return saleDetailSchema.parse({ sale: result.rows[0], lines: lines.rows });
  }
  async get(id: string) {
    return this.database.run(async (client) => {
      await client.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      return this.detail(client, id);
    }, true);
  }
  async list(query: SalesQuery) {
    return this.database.run(async (client) => {
      const values = [
        SHOP_ID,
        `%${query.search.replace(/[\\%_]/g, '\\$&')}%`,
        query.from ?? null,
        query.to ?? null,
        query.status,
      ];
      const where = `s.shop_id=$1 AND (s.sale_code ILIKE $2 OR s.customer_snapshot->>'name' ILIKE $2 OR s.bill_reference ILIKE $2) AND ($3::date IS NULL OR s.sale_date >= $3) AND ($4::date IS NULL OR s.sale_date <= $4) AND ($5='ALL' OR ($5='POSTED' AND x.sale_id IS NULL) OR ($5='CANCELLED' AND x.sale_id IS NOT NULL))`;
      const result = await client.query(
        `SELECT ${columns},count(*) OVER()::int AS "totalCount" FROM ${from} WHERE ${where} ORDER BY s.sale_date DESC,s.created_at DESC,s.id DESC LIMIT $6 OFFSET $7`,
        [...values, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const total = result.rows.length
        ? result.rows[0].totalCount
        : (
            await client.query(
              `SELECT count(*)::int AS count FROM ${from} WHERE ${where}`,
              values,
            )
          ).rows[0].count;
      return salesListSchema.parse({
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
        `SELECT count(*) FILTER(WHERE x.sale_id IS NULL)::int AS posted,count(*) FILTER(WHERE x.sale_id IS NOT NULL)::int AS cancelled,COALESCE(sum(s.total_npr) FILTER(WHERE x.sale_id IS NULL),0.00)::text AS "postedTotalNpr" FROM ${from} WHERE s.shop_id=$1`,
        [SHOP_ID],
      );
      return salesSummarySchema.parse(result.rows[0]);
    });
  }

  async quote(
    client: pg.PoolClient,
    draft: SaleDraft,
    lock: boolean,
    balanceOverride?: string,
    extraRateKeys: string[] = [],
  ): Promise<SalePreview> {
    const loaded = await loadCustomer(client, draft.customerId, lock);
    const customer =
      balanceOverride === undefined
        ? loaded
        : { ...loaded, balanceNpr: balanceOverride };
    if (draft.saleDate < customer.latestEntryDate)
      throw new BadRequestException(
        `Sale date must be on or after ${customer.latestEntryDate}, the customer’s latest account date.`,
      );
    if (draft.orderId && lock) await loadOrder(client, draft.orderId, true);
    const result = await client.query(
      `SELECT ${inventoryColumns},to_char(received_at AT TIME ZONE 'Asia/Kathmandu','YYYY-MM-DD') AS "receivedOn" FROM inventory_items WHERE shop_id=$1 AND id=ANY($2::uuid[]) ORDER BY id ${lock ? 'FOR UPDATE' : ''}`,
      [SHOP_ID, draft.lines.map((line) => line.itemId)],
    );
    if (result.rows.length !== draft.lines.length)
      throw new NotFoundException('One or more pieces were not found.');
    const items = result.rows.map((row) => {
      const item = inventoryItemSchema.parse(row);
      if (item.status !== 'AVAILABLE')
        throw new ConflictException(
          `${item.itemCode} is no longer available. Refresh your selection.`,
        );
      if (draft.saleDate < row.receivedOn)
        throw new BadRequestException(
          `Sale date cannot precede the stock receipt date for ${item.itemCode}.`,
        );
      return item;
    });
    const order = draft.orderId
      ? await validateOrderDelivery(
          client,
          draft.orderId,
          draft.customerId,
          items,
          draft.saleDate,
          false,
        )
      : null;
    const keys = [
      ...new Set([
        ...items.map((item) => `${item.metal}:${item.fineness}`),
        ...extraRateKeys,
      ]),
    ].sort();
    if (lock)
      for (const key of keys)
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`metal-rate:${SHOP_ID}:${draft.saleDate}:${key}`],
        );
    const rated = [];
    for (const line of draft.lines) {
      const item = items.find((item) => item.id === line.itemId)!;
      const result = await client.query(
        `SELECT ${rateColumns} FROM metal_rates WHERE shop_id=$1 AND rate_date=$2 AND metal=$3 AND fineness=$4 ORDER BY revision DESC LIMIT 1`,
        [SHOP_ID, draft.saleDate, item.metal, item.fineness],
      );
      if (!result.rowCount || result.rows[0].id !== line.rateId)
        throw new ConflictException(
          `Choose the latest ${item.metal.toLowerCase()} rate for ${item.fineness}‰ on ${draft.saleDate}, then review the sale again.`,
        );
      const rate = metalRateSchema.parse(result.rows[0]);
      rated.push({
        item: saleItemSnapshotSchema.parse(item),
        rate,
        wastageGrams: line.wastageGrams,
        makingNpr: line.makingNpr,
        stonesNpr: line.stonesNpr,
      });
    }
    try {
      const pricing = priceSale({
        lines: rated.map((line) => ({
          netWeightGrams: line.item.netWeightGrams,
          wastageGrams: line.wastageGrams,
          sellRatePerTola: line.rate.sellRatePerTola,
          gramsPerTola: line.rate.gramsPerTola,
          makingNpr: line.makingNpr,
          stonesNpr: line.stonesNpr,
        })),
        discountNpr: draft.discountNpr,
        taxNpr: draft.taxNpr,
        paymentNpr: draft.paymentNpr,
        balanceBeforeNpr: customer.balanceNpr,
      });
      return salePreviewSchema.parse({
        ...pricing,
        customer,
        order: order
          ? { id: order.id, orderCode: order.orderCode, version: order.version }
          : null,
        saleDate: draft.saleDate,
        lines: rated.map((line, index) => ({
          ...line,
          ...pricing.lines[index],
        })),
      });
    } catch (error) {
      if (error instanceof RangeError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
  async preview(draft: SaleDraft) {
    return this.database.run(async (client) => {
      await client.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      return this.quote(client, draft, false);
    }, true);
  }

  async post(input: PostSale) {
    return this.database.run(
      (client) => this.postWithClient(client, input),
      true,
    );
  }
  async postWithClient(
    client: pg.PoolClient,
    input: PostSale,
    saleId?: string,
    reservedCode?: Awaited<ReturnType<typeof nextShopNumber>>,
  ) {
    // Keep the fingerprints of ready-made sales posted before order support compatible.
    const { orderId, expectedOrderVersion, ...legacyInput } = input;
    const fingerprint = hash(
      orderId === null && expectedOrderVersion === null ? legacyInput : input,
    );
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `sale-create:${SHOP_ID}:${input.requestId}`,
    ]);
    const existing = await client.query(
      'SELECT id,request_fingerprint FROM sales WHERE shop_id=$1 AND request_id=$2',
      [SHOP_ID, input.requestId],
    );
    if (existing.rowCount) {
      if (existing.rows[0].request_fingerprint !== fingerprint)
        throw new ConflictException(
          'This request was already used for a different sale. Check the sales register before creating another record.',
        );
      return this.detail(client, existing.rows[0].id);
    }
    const quote = await this.quote(client, input, true);
    if (
      cents(quote.totalNpr) !== cents(input.expectedTotalNpr) ||
      cents(quote.balanceBeforeNpr) !== cents(input.expectedBalanceNpr) ||
      quote.customer.version !== input.expectedCustomerVersion ||
      (quote.order?.version ?? null) !== input.expectedOrderVersion
    )
      throw new ConflictException(
        'The customer account, order or sale total has changed. Review the sale again before posting.',
      );
    const id = saleId ?? randomUUID();
    const code = reservedCode ?? (await nextShopNumber(client, 'SALE'));
    const customer = customerSnapshot(quote.customer);
    await client.query(
      `INSERT INTO sales(id,shop_id,customer_id,sale_code,sale_date,customer_snapshot,subtotal_npr,discount_npr,tax_npr,total_npr,payment_npr,advance_applied_npr,due_at_posting_npr,balance_before_npr,balance_after_npr,payment_method,payment_reference,bill_reference,notes,request_id,request_fingerprint,order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        id,
        SHOP_ID,
        input.customerId,
        code.code,
        input.saleDate,
        JSON.stringify(customer),
        quote.subtotalNpr,
        quote.discountNpr,
        quote.taxNpr,
        quote.totalNpr,
        quote.paymentNpr,
        quote.advanceAppliedNpr,
        quote.dueAtPostingNpr,
        quote.balanceBeforeNpr,
        quote.balanceAfterNpr,
        input.paymentMethod,
        input.paymentReference,
        input.billReference,
        input.notes,
        input.requestId,
        fingerprint,
        input.orderId,
      ],
    );
    for (const [index, line] of quote.lines.entries()) {
      await client.query(
        `INSERT INTO sale_lines(shop_id,sale_id,line_number,item_id,rate_id,item_snapshot,rate_snapshot,wastage_grams,metal_npr,wastage_npr,making_npr,stones_npr,line_total_npr) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          SHOP_ID,
          id,
          index + 1,
          line.item.id,
          line.rate.id,
          JSON.stringify(line.item),
          JSON.stringify(line.rate),
          line.wastageGrams,
          line.metalNpr,
          line.wastageNpr,
          line.makingNpr,
          line.stonesNpr,
          line.lineTotalNpr,
        ],
      );
      await client.query(
        "UPDATE inventory_items SET status='SOLD',active_sale_id=$3 WHERE shop_id=$1 AND id=$2",
        [SHOP_ID, line.item.id, id],
      );
      await client.query(
        `INSERT INTO inventory_movements(id,shop_id,item_id,kind,net_weight_grams,reason,sale_id) VALUES($1,$2,$3,'SALE',-$4::numeric,$5,$6)`,
        [
          randomUUID(),
          SHOP_ID,
          line.item.id,
          line.item.netWeightGrams,
          `Sold on ${code.code}`,
          id,
        ],
      );
    }
    const charge = await nextShopNumber(client, 'ACCOUNT_ENTRY');
    await client.query(
      `INSERT INTO customer_account_entries(id,shop_id,customer_id,entry_number,entry_code,entry_date,kind,amount_npr,reference,notes,customer_snapshot,request_id,request_fingerprint,sale_id) VALUES($1,$2,$3,$4,$5,$6,'SALE_CHARGE',$7,$8,$9,$10,$11,$12,$13)`,
      [
        randomUUID(),
        SHOP_ID,
        input.customerId,
        charge.number,
        charge.code,
        input.saleDate,
        quote.totalNpr,
        code.code,
        'Sale posted',
        JSON.stringify(customer),
        randomUUID(),
        fingerprint,
        id,
      ],
    );
    if (cents(quote.paymentNpr) > 0n) {
      const payment = await nextShopNumber(client, 'ACCOUNT_ENTRY');
      await client.query(
        `INSERT INTO customer_account_entries(id,shop_id,customer_id,entry_number,entry_code,entry_date,kind,amount_npr,method,reference,notes,customer_snapshot,request_id,request_fingerprint,sale_id) VALUES($1,$2,$3,$4,$5,$6,'PAYMENT',-$7::numeric,$8,$9,$10,$11,$12,$13,$14)`,
        [
          randomUUID(),
          SHOP_ID,
          input.customerId,
          payment.number,
          payment.code,
          input.saleDate,
          quote.paymentNpr,
          input.paymentMethod,
          input.paymentReference || code.code,
          `Received with ${code.code}`,
          JSON.stringify(customer),
          randomUUID(),
          fingerprint,
          id,
        ],
      );
    }
    if (quote.order)
      await appendOrderEvent(client, quote.order, {
        kind: 'SALE_DELIVERED',
        status: 'DELIVERED',
        eventDate: input.saleDate,
        reason: `Delivered through ${code.code}`,
        saleId: id,
        requestId: randomUUID(),
        fingerprint,
      });
    return this.detail(client, id);
  }

  async cancel(id: string, input: CancelSale) {
    return this.database.run(
      (client) => this.cancelWithClient(client, id, input),
      true,
    );
  }
  async cancelWithClient(
    client: pg.PoolClient,
    id: string,
    input: CancelSale,
    allowedPurchaseId?: string,
  ) {
    const first = await client.query(
      'SELECT customer_id FROM sales WHERE shop_id=$1 AND id=$2',
      [SHOP_ID, id],
    );
    if (!first.rowCount) throw new NotFoundException('Sale not found.');
    const customer = await loadCustomer(
      client,
      first.rows[0].customer_id,
      true,
    );
    await client.query(
      'SELECT id FROM sales WHERE shop_id=$1 AND id=$2 FOR UPDATE',
      [SHOP_ID, id],
    );
    const fingerprint = hash([id, input]);
    const existing = await client.query(
      'SELECT sale_id,request_fingerprint FROM sale_cancellations WHERE shop_id=$1 AND request_id=$2',
      [SHOP_ID, input.requestId],
    );
    if (existing.rowCount) {
      if (
        existing.rows[0].sale_id !== id ||
        existing.rows[0].request_fingerprint !== fingerprint
      )
        throw new ConflictException(
          'This request was already used for a different cancellation.',
        );
      return this.detail(client, id);
    }
    const linked = await client.query(
      'SELECT id FROM metal_purchases WHERE shop_id=$1 AND sale_id=$2',
      [SHOP_ID, id],
    );
    if (linked.rowCount && linked.rows[0].id !== allowedPurchaseId)
      throw new ConflictException(
        'Correct this exchange from Purchases so incoming metal, outgoing pieces and settlement reverse together.',
      );
    const detail = await this.detail(client, id);
    if (detail.sale.status !== 'POSTED')
      throw new ConflictException('This sale has already been cancelled.');
    if (input.cancellationDate < customer.latestEntryDate)
      throw new BadRequestException(
        `Cancellation date must be on or after ${customer.latestEntryDate}.`,
      );
    const order = detail.sale.orderId
      ? await loadOrder(client, detail.sale.orderId, true)
      : null;
    if (order && (order.status !== 'DELIVERED' || order.activeSaleId !== id))
      throw new ConflictException(
        'The linked order no longer matches this sale. Refresh before correcting.',
      );
    if (order && input.cancellationDate < order.latestActivityDate)
      throw new BadRequestException(
        `Correction date must be on or after ${order.latestActivityDate}.`,
      );
    const stock = await client.query(
      'SELECT id,status,active_sale_id FROM inventory_items WHERE shop_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',
      [SHOP_ID, detail.lines.map((line) => line.item.id)],
    );
    if (
      stock.rows.length !== detail.lines.length ||
      stock.rows.some(
        (item) => item.status !== 'SOLD' || item.active_sale_id !== id,
      )
    )
      throw new ConflictException(
        'The stock no longer matches this sale. Refresh before correcting it.',
      );
    await client.query(
      'INSERT INTO sale_cancellations(id,shop_id,sale_id,cancellation_date,reason,request_id,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        randomUUID(),
        SHOP_ID,
        id,
        input.cancellationDate,
        input.reason,
        input.requestId,
        fingerprint,
      ],
    );
    for (const line of detail.lines) {
      await client.query(
        "UPDATE inventory_items SET status='AVAILABLE',active_sale_id=NULL WHERE shop_id=$1 AND id=$2",
        [SHOP_ID, line.item.id],
      );
      await client.query(
        `INSERT INTO inventory_movements(id,shop_id,item_id,kind,net_weight_grams,reason,sale_id) VALUES($1,$2,$3,'SALE_CANCEL',$4,$5,$6)`,
        [
          randomUUID(),
          SHOP_ID,
          line.item.id,
          line.item.netWeightGrams,
          `${detail.sale.saleCode}: ${input.reason}`,
          id,
        ],
      );
    }
    const originals = await client.query(
      "SELECT id,entry_code,amount_npr::text FROM customer_account_entries WHERE shop_id=$1 AND sale_id=$2 AND kind IN ('SALE_CHARGE','PAYMENT') ORDER BY entry_number",
      [SHOP_ID, id],
    );
    for (const original of originals.rows) {
      const entry = await nextShopNumber(client, 'ACCOUNT_ENTRY');
      await client.query(
        `INSERT INTO customer_account_entries(id,shop_id,customer_id,entry_number,entry_code,entry_date,kind,amount_npr,reference,notes,reversal_of,customer_snapshot,request_id,request_fingerprint,sale_id) VALUES($1,$2,$3,$4,$5,$6,'REVERSAL',-$7::numeric,$8,$9,$10,$11,$12,$13,$14)`,
        [
          randomUUID(),
          SHOP_ID,
          customer.id,
          entry.number,
          entry.code,
          input.cancellationDate,
          original.amount_npr,
          original.entry_code,
          input.reason,
          original.id,
          JSON.stringify(customerSnapshot(customer)),
          randomUUID(),
          fingerprint,
          id,
        ],
      );
    }
    if (order)
      await appendOrderEvent(client, order, {
        kind: 'SALE_REOPENED',
        status: 'READY',
        eventDate: input.cancellationDate,
        reason: `Sale ${detail.sale.saleCode} corrected: ${input.reason}`.slice(
          0,
          500,
        ),
        saleId: id,
        requestId: randomUUID(),
        fingerprint,
      });
    return this.detail(client, id);
  }
}
