import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type pg from 'pg';
import {
  metalRateSchema,
  purchaseDetailSchema,
  purchasePreviewSchema,
  purchasesListSchema,
  type PurchaseDraft,
  type PostPurchase,
  type CancelPurchase,
  type PurchasesQuery,
  type PurchasePreview,
  type PostSale,
} from '@awesomejm/contracts';
import { pricePurchase, purchaseSettlement } from '@awesomejm/calculations';
import { DatabaseService } from '../database/database.service.js';
import { loadCustomer, customerSnapshot } from '../customers/accounting.js';
import { SalesService } from '../sales/sales.service.js';
import { SHOP_ID } from '../shop/shop.js';
import { nextShopNumber } from '../shop/counters.js';
import { rateColumns } from '../rates/rate-row.js';
import { orderHash } from '../orders/order-posting.js';
const cents = (value: string) => {
  const [a = '0', b = ''] = value.replace(/^-/, '').split('.');
  return (
    (BigInt(a) * 100n + BigInt(b.padEnd(2, '0'))) *
    (value.startsWith('-') ? -1n : 1n)
  );
};
const columns = `p.id,p.purchase_code AS "purchaseCode",p.customer_id AS "customerId",p.customer_snapshot AS "customerSnapshot",p.purchase_date::text AS "purchaseDate",p.total_npr AS "totalNpr",p.sale_id AS "saleId",p.payout_npr AS "payoutNpr",p.payout_method AS "payoutMethod",p.payout_reference AS "payoutReference",p.reference,p.notes,p.balance_before_npr AS "balanceBeforeNpr",p.balance_after_npr AS "balanceAfterNpr",CASE WHEN x.purchase_id IS NULL THEN 'POSTED' ELSE 'CANCELLED' END AS status,to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",x.cancellation_date::text AS "cancellationDate",x.reason AS "cancellationReason"`;
const from =
  'metal_purchases p LEFT JOIN purchase_cancellations x ON x.shop_id=p.shop_id AND x.purchase_id=p.id';
@Injectable()
export class PurchasesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sales: SalesService,
  ) {}
  private async detail(client: pg.PoolClient, id: string) {
    const record = await client.query(
      `SELECT ${columns} FROM ${from} WHERE p.shop_id=$1 AND p.id=$2`,
      [SHOP_ID, id],
    );
    if (!record.rowCount) throw new NotFoundException('Purchase not found.');
    const lines = await client.query(
      'SELECT snapshot FROM old_metal_lots WHERE shop_id=$1 AND purchase_id=$2 ORDER BY line_number',
      [SHOP_ID, id],
    );
    const sale = record.rows[0].saleId
      ? await this.sales.detail(client, record.rows[0].saleId)
      : null;
    return purchaseDetailSchema.parse({
      purchase: record.rows[0],
      lines: lines.rows.map((r) => r.snapshot),
      sale,
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
  async list(query: PurchasesQuery) {
    return this.database.run(async (client) => {
      const where = `p.shop_id=$1 AND (p.purchase_code ILIKE $2 OR p.customer_snapshot->>'name' ILIKE $2 OR p.reference ILIKE $2) AND ($3='ALL' OR ($3='POSTED' AND x.purchase_id IS NULL) OR ($3='CANCELLED' AND x.purchase_id IS NOT NULL)) AND ($4::date IS NULL OR p.purchase_date>=$4) AND ($5::date IS NULL OR p.purchase_date<=$5)`;
      const values = [
        SHOP_ID,
        `%${query.search.replace(/[\\%_]/g, '\\$&')}%`,
        query.status,
        query.from ?? null,
        query.to ?? null,
      ];
      const result = await client.query(
        `SELECT ${columns},count(*) OVER()::int AS count FROM ${from} WHERE ${where} ORDER BY p.purchase_date DESC,p.created_at DESC,p.id DESC LIMIT $6 OFFSET $7`,
        [...values, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const total = result.rows.length
        ? result.rows[0].count
        : (
            await client.query(
              `SELECT count(*)::int AS count FROM ${from} WHERE ${where}`,
              values,
            )
          ).rows[0].count;
      return purchasesListSchema.parse({
        items: result.rows,
        total,
        page: query.page,
        pageSize: query.pageSize,
      });
    });
  }
  private async quote(
    client: pg.PoolClient,
    draft: PurchaseDraft,
    lock: boolean,
  ): Promise<PurchasePreview> {
    const customer = await loadCustomer(client, draft.customerId, lock);
    if (draft.purchaseDate < customer.latestEntryDate)
      throw new BadRequestException(
        `Choose a purchase date on or after ${customer.latestEntryDate}.`,
      );
    const keys = [
      ...new Set(draft.lines.map((line) => `${line.metal}:${line.fineness}`)),
    ].sort();
    if (lock && !draft.sale)
      for (const key of keys)
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`metal-rate:${SHOP_ID}:${draft.purchaseDate}:${key}`],
        );
    const rated = [];
    for (const line of draft.lines) {
      const result = await client.query(
        `SELECT ${rateColumns} FROM metal_rates WHERE shop_id=$1 AND rate_date=$2 AND metal=$3 AND fineness=$4 ORDER BY revision DESC LIMIT 1`,
        [SHOP_ID, draft.purchaseDate, line.metal, line.fineness],
      );
      if (!result.rowCount || result.rows[0].id !== line.rateId)
        throw new ConflictException(
          `Choose the latest buying rate for ${line.metal.toLowerCase()} ${line.fineness}‰ on ${draft.purchaseDate}.`,
        );
      rated.push({ ...line, rate: metalRateSchema.parse(result.rows[0]) });
    }
    try {
      const price = pricePurchase(
        rated.map((line) => ({
          ...line,
          buyRatePerTola: line.rate.buyRatePerTola,
          gramsPerTola: line.rate.gramsPerTola,
        })),
      );
      const credit = purchaseSettlement({
        purchaseNpr: price.totalNpr,
        saleNpr: '0',
        receivedNpr: '0',
        payoutNpr: '0',
        balanceBeforeNpr: customer.balanceNpr,
      });
      // Sales locks outgoing pieces, then the combined sorted buy/sell rate keys.
      // Recheck the immutable buying quotes after acquiring those locks.
      const sale = draft.sale
        ? await this.sales.quote(
            client,
            draft.sale,
            lock,
            credit.balanceAfterCreditNpr,
            keys,
          )
        : null;
      if (lock && draft.sale)
        for (const line of rated) {
          const latest = await client.query(
            'SELECT id FROM metal_rates WHERE shop_id=$1 AND rate_date=$2 AND metal=$3 AND fineness=$4 ORDER BY revision DESC LIMIT 1',
            [SHOP_ID, draft.purchaseDate, line.metal, line.fineness],
          );
          if (latest.rows[0]?.id !== line.rateId)
            throw new ConflictException(
              'A buying rate changed. Review the exchange again.',
            );
        }
      const settlement = purchaseSettlement({
        purchaseNpr: price.totalNpr,
        saleNpr: sale?.totalNpr ?? '0',
        receivedNpr: draft.sale?.paymentNpr ?? '0',
        payoutNpr: draft.payoutNpr,
        balanceBeforeNpr: customer.balanceNpr,
      });
      return purchasePreviewSchema.parse({
        customer,
        purchaseDate: draft.purchaseDate,
        lines: rated.map((line, index) => ({ ...line, ...price.lines[index] })),
        totalNpr: price.totalNpr,
        sale,
        ...settlement,
      });
    } catch (error) {
      if (error instanceof RangeError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
  async preview(draft: PurchaseDraft) {
    return this.database.run(async (client) => {
      await client.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      return this.quote(client, draft, false);
    }, true);
  }
  async post(input: PostPurchase) {
    return this.database.run(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`purchase-create:${SHOP_ID}:${input.requestId}`],
      );
      const fingerprint = orderHash(input),
        existing = await client.query(
          'SELECT id,request_fingerprint FROM metal_purchases WHERE shop_id=$1 AND request_id=$2',
          [SHOP_ID, input.requestId],
        );
      if (existing.rowCount) {
        if (existing.rows[0].request_fingerprint !== fingerprint)
          throw new ConflictException(
            'This request was already used for another purchase. Check the register before submitting again.',
          );
        return this.detail(client, existing.rows[0].id);
      }
      const quote = await this.quote(client, input, true);
      if (
        cents(quote.totalNpr) !== cents(input.expectedPurchaseNpr) ||
        cents(quote.sale?.totalNpr ?? '0') !== cents(input.expectedSaleNpr) ||
        cents(quote.balanceBeforeNpr) !== cents(input.expectedBalanceNpr) ||
        quote.customer.version !== input.expectedCustomerVersion ||
        (quote.sale?.order?.version ?? null) !== input.expectedOrderVersion
      )
        throw new ConflictException(
          'The rates, customer account or exchange changed. Review again before posting.',
        );
      const id = randomUUID(),
        saleId = input.sale ? randomUUID() : null,
        code = await nextShopNumber(client, 'PURCHASE'),
        snapshot = customerSnapshot(quote.customer);
      // Reserve the sale number before acquiring the account-entry counter.
      const reservedSaleCode = input.sale
        ? await nextShopNumber(client, 'SALE')
        : undefined;
      await client.query(
        `INSERT INTO metal_purchases(id,shop_id,customer_id,purchase_code,purchase_date,customer_snapshot,total_npr,sale_id,payout_npr,payout_method,payout_reference,reference,notes,balance_before_npr,balance_after_npr,request_id,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          id,
          SHOP_ID,
          input.customerId,
          code.code,
          input.purchaseDate,
          JSON.stringify(snapshot),
          quote.totalNpr,
          saleId,
          input.payoutNpr,
          input.payoutMethod,
          input.payoutReference,
          input.reference,
          input.notes,
          quote.balanceBeforeNpr,
          quote.balanceAfterNpr,
          input.requestId,
          fingerprint,
        ],
      );
      for (const [index, line] of quote.lines.entries()) {
        const lotId = randomUUID(),
          lotCode = `${code.code}/${String(index + 1).padStart(2, '0')}`;
        await client.query(
          `INSERT INTO old_metal_lots(id,shop_id,purchase_id,line_number,lot_code,metal,fineness,net_weight_grams,fine_weight_grams,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            lotId,
            SHOP_ID,
            id,
            index + 1,
            lotCode,
            line.metal,
            line.fineness,
            line.netWeightGrams,
            line.fineWeightGrams,
            JSON.stringify({ ...line, lotId, lotCode }),
          ],
        );
        await client.query(
          `INSERT INTO old_metal_movements(id,shop_id,purchase_id,lot_id,kind,movement_date,net_weight_grams,fine_weight_grams) VALUES($1,$2,$3,$4,'PURCHASE',$5,$6,$7)`,
          [
            randomUUID(),
            SHOP_ID,
            id,
            lotId,
            input.purchaseDate,
            line.netWeightGrams,
            line.fineWeightGrams,
          ],
        );
      }
      const charge = await nextShopNumber(client, 'ACCOUNT_ENTRY');
      await client.query(
        `INSERT INTO customer_account_entries(id,shop_id,customer_id,entry_number,entry_code,entry_date,kind,amount_npr,reference,notes,customer_snapshot,request_id,request_fingerprint,purchase_id) VALUES($1,$2,$3,$4,$5,$6,'METAL_PURCHASE',-$7::numeric,$8,'Old metal received',$9,$10,$11,$12)`,
        [
          randomUUID(),
          SHOP_ID,
          input.customerId,
          charge.number,
          charge.code,
          input.purchaseDate,
          quote.totalNpr,
          code.code,
          JSON.stringify(snapshot),
          randomUUID(),
          fingerprint,
          id,
        ],
      );
      if (input.sale && quote.sale && saleId) {
        const saleInput: PostSale = {
          ...input.sale,
          requestId: randomUUID(),
          expectedTotalNpr: quote.sale.totalNpr,
          expectedBalanceNpr: quote.balanceAfterCreditNpr,
          expectedCustomerVersion: quote.customer.version,
          expectedOrderVersion: quote.sale.order?.version ?? null,
        };
        await this.sales.postWithClient(
          client,
          saleInput,
          saleId,
          reservedSaleCode,
        );
      }
      if (cents(input.payoutNpr) > 0n) {
        const payout = await nextShopNumber(client, 'ACCOUNT_ENTRY');
        await client.query(
          `INSERT INTO customer_account_entries(id,shop_id,customer_id,entry_number,entry_code,entry_date,kind,amount_npr,method,reference,notes,customer_snapshot,request_id,request_fingerprint,purchase_id) VALUES($1,$2,$3,$4,$5,$6,'PURCHASE_PAYOUT',$7,$8,$9,'Paid out on metal purchase',$10,$11,$12,$13)`,
          [
            randomUUID(),
            SHOP_ID,
            input.customerId,
            payout.number,
            payout.code,
            input.purchaseDate,
            input.payoutNpr,
            input.payoutMethod,
            input.payoutReference || code.code,
            JSON.stringify(snapshot),
            randomUUID(),
            fingerprint,
            id,
          ],
        );
      }
      return this.detail(client, id);
    }, true);
  }
  async cancel(id: string, input: CancelPurchase) {
    return this.database.run(async (client) => {
      const first = await client.query(
        'SELECT customer_id FROM metal_purchases WHERE shop_id=$1 AND id=$2',
        [SHOP_ID, id],
      );
      if (!first.rowCount) throw new NotFoundException('Purchase not found.');
      const customer = await loadCustomer(
        client,
        first.rows[0].customer_id,
        true,
      );
      await client.query(
        'SELECT id FROM metal_purchases WHERE shop_id=$1 AND id=$2 FOR UPDATE',
        [SHOP_ID, id],
      );
      const fingerprint = orderHash([id, input]),
        existing = await client.query(
          'SELECT purchase_id,request_fingerprint FROM purchase_cancellations WHERE shop_id=$1 AND request_id=$2',
          [SHOP_ID, input.requestId],
        );
      if (existing.rowCount) {
        if (
          existing.rows[0].purchase_id !== id ||
          existing.rows[0].request_fingerprint !== fingerprint
        )
          throw new ConflictException(
            'This request was used for a different correction.',
          );
        return this.detail(client, id);
      }
      const detail = await this.detail(client, id);
      if (detail.purchase.status === 'CANCELLED')
        throw new ConflictException(
          'This purchase has already been corrected.',
        );
      if (input.cancellationDate < customer.latestEntryDate)
        throw new BadRequestException(
          `Choose a correction date on or after ${customer.latestEntryDate}.`,
        );
      const held = await client.query(
        `SELECT l.id FROM old_metal_lots l WHERE l.shop_id=$1 AND l.purchase_id=$2 AND l.net_weight_grams<>(SELECT sum(m.net_weight_grams) FROM old_metal_movements m WHERE m.shop_id=l.shop_id AND m.lot_id=l.id)`,
        [SHOP_ID, id],
      );
      if (held.rowCount)
        throw new ConflictException(
          'The complete incoming lots must still be held before correcting this purchase.',
        );
      if (detail.purchase.saleId)
        await this.sales.cancelWithClient(
          client,
          detail.purchase.saleId,
          input,
          id,
        );
      await client.query(
        'INSERT INTO purchase_cancellations(id,shop_id,purchase_id,cancellation_date,reason,request_id,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7)',
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
      for (const line of detail.lines)
        await client.query(
          `INSERT INTO old_metal_movements(id,shop_id,purchase_id,lot_id,kind,movement_date,net_weight_grams,fine_weight_grams) VALUES($1,$2,$3,$4,'PURCHASE_CANCEL',$5,-$6::numeric,-$7::numeric)`,
          [
            randomUUID(),
            SHOP_ID,
            id,
            line.lotId,
            input.cancellationDate,
            line.netWeightGrams,
            line.fineWeightGrams,
          ],
        );
      const originals = await client.query(
        "SELECT id,entry_code,amount_npr FROM customer_account_entries WHERE shop_id=$1 AND purchase_id=$2 AND kind IN ('METAL_PURCHASE','PURCHASE_PAYOUT') ORDER BY entry_number",
        [SHOP_ID, id],
      );
      for (const original of originals.rows) {
        const entry = await nextShopNumber(client, 'ACCOUNT_ENTRY');
        await client.query(
          `INSERT INTO customer_account_entries(id,shop_id,customer_id,entry_number,entry_code,entry_date,kind,amount_npr,reference,notes,reversal_of,customer_snapshot,request_id,request_fingerprint,purchase_id) VALUES($1,$2,$3,$4,$5,$6,'REVERSAL',-$7::numeric,$8,$9,$10,$11,$12,$13,$14)`,
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
      return this.detail(client, id);
    }, true);
  }
}
