import { Injectable } from '@nestjs/common';
import type pg from 'pg';
import {
  dashboardSchema,
  nepalToday,
  reportsSchema,
  type ReportsQuery,
} from '@awesomejm/contracts';
import { DatabaseService } from '../database/database.service.js';
import { SHOP_ID } from '../shop/shop.js';
const cashFacts = `SELECT CASE WHEN COALESCE(r.kind,e.kind)='PAYMENT' THEN 'RECEIPT' ELSE 'PAYOUT' END AS kind,e.entry_date AS day,CASE WHEN COALESCE(r.kind,e.kind)='PAYMENT' THEN -e.amount_npr ELSE e.amount_npr END AS amount,COALESCE(e.method,r.method) AS method FROM customer_account_entries e LEFT JOIN customer_account_entries r ON r.shop_id=e.shop_id AND r.id=e.reversal_of WHERE e.shop_id=$1 AND (e.kind IN ('PAYMENT','ADVANCE_REFUND','PURCHASE_PAYOUT') OR (e.kind='REVERSAL' AND r.kind IN ('PAYMENT','ADVANCE_REFUND','PURCHASE_PAYOUT')))`;
const facts = `SELECT 'SALE' AS kind,sale_date AS day,total_npr AS amount,NULL::text AS method FROM sales WHERE shop_id=$1
 UNION ALL SELECT 'SALE_CANCEL',x.cancellation_date,s.total_npr,NULL::text FROM sale_cancellations x JOIN sales s ON s.shop_id=x.shop_id AND s.id=x.sale_id WHERE x.shop_id=$1
 UNION ALL SELECT 'PURCHASE',purchase_date,total_npr,NULL::text FROM metal_purchases WHERE shop_id=$1
 UNION ALL SELECT 'PURCHASE_CANCEL',x.cancellation_date,p.total_npr,NULL::text FROM purchase_cancellations x JOIN metal_purchases p ON p.shop_id=x.shop_id AND p.id=x.purchase_id WHERE x.shop_id=$1
 UNION ALL ${cashFacts}`;
const sums = `count(*) FILTER(WHERE kind='SALE')::int AS "postedSales",count(*) FILTER(WHERE kind='SALE_CANCEL')::int AS "cancelledSales",
 COALESCE(sum(amount) FILTER(WHERE kind='SALE'),0.00)::text AS "salesNpr",COALESCE(sum(amount) FILTER(WHERE kind='SALE_CANCEL'),0.00)::text AS "salesCorrectionsNpr",COALESCE(sum(CASE WHEN kind='SALE' THEN amount WHEN kind='SALE_CANCEL' THEN -amount ELSE 0 END),0.00)::text AS "netSalesNpr",
 count(*) FILTER(WHERE kind='PURCHASE')::int AS "postedPurchases",count(*) FILTER(WHERE kind='PURCHASE_CANCEL')::int AS "cancelledPurchases",
 COALESCE(sum(amount) FILTER(WHERE kind='PURCHASE'),0.00)::text AS "purchasesNpr",COALESCE(sum(amount) FILTER(WHERE kind='PURCHASE_CANCEL'),0.00)::text AS "purchaseCorrectionsNpr",COALESCE(sum(CASE WHEN kind='PURCHASE' THEN amount WHEN kind='PURCHASE_CANCEL' THEN -amount ELSE 0 END),0.00)::text AS "netPurchasesNpr",
 COALESCE(sum(amount) FILTER(WHERE kind='RECEIPT'),0.00)::text AS "receivedNpr",COALESCE(sum(amount) FILTER(WHERE kind='PAYOUT'),0.00)::text AS "paidNpr",COALESCE(sum(CASE WHEN kind='RECEIPT' THEN amount WHEN kind='PAYOUT' THEN -amount ELSE 0 END),0.00)::text AS "netCashNpr"`;
@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}
  private async activity(client: pg.PoolClient, q: ReportsQuery) {
    const values = [SHOP_ID, q.from, q.to, q.groupBy];
    const series = await client.query(
      `WITH facts AS (${facts}),periods AS (SELECT DISTINCT CASE WHEN $4='MONTH' THEN to_char(day,'YYYY-MM') ELSE to_char(day,'YYYY-MM-DD') END AS period FROM generate_series($2::date,$3::date,'1 day') day),tagged AS (SELECT *,CASE WHEN $4='MONTH' THEN to_char(day,'YYYY-MM') ELSE to_char(day,'YYYY-MM-DD') END AS period FROM facts WHERE day BETWEEN $2::date AND $3::date) SELECT p.period,${sums} FROM periods p LEFT JOIN tagged t ON t.period=p.period GROUP BY p.period ORDER BY p.period`,
      values,
    );
    const totals = await client.query(
      `WITH facts AS (${facts}) SELECT 'TOTAL' AS period,${sums} FROM facts WHERE day BETWEEN $2::date AND $3::date`,
      values.slice(0, 3),
    );
    return { series: series.rows, totals: totals.rows[0] };
  }
  private async accounts(client: pg.PoolClient, date: string) {
    return (
      await client.query(
        `WITH balances AS (SELECT customer_id,sum(amount_npr) AS balance FROM customer_account_entries WHERE shop_id=$1 AND entry_date<=$2 GROUP BY customer_id) SELECT COALESCE(sum(GREATEST(balance,0)),0.00)::text AS "duesNpr",COALESCE(sum(GREATEST(-balance,0)),0.00)::text AS "advancesNpr" FROM balances`,
        [SHOP_ID, date],
      )
    ).rows[0];
  }
  private async stock(client: pg.PoolClient, q: ReportsQuery) {
    return (
      await client.query(
        `WITH moves AS (
 SELECT 'JEWELLERY' AS class,i.metal,i.fineness,CASE m.kind WHEN 'SALE' THEN s.sale_date WHEN 'SALE_CANCEL' THEN x.cancellation_date ELSE (m.created_at AT TIME ZONE 'Asia/Kathmandu')::date END AS day,m.kind,m.net_weight_grams AS grams,CASE WHEN m.net_weight_grams>0 THEN i.fine_weight_grams ELSE -i.fine_weight_grams END AS fine,CASE WHEN m.net_weight_grams>0 THEN 1 ELSE -1 END AS qty FROM inventory_movements m JOIN inventory_items i ON i.shop_id=m.shop_id AND i.id=m.item_id LEFT JOIN sales s ON s.shop_id=m.shop_id AND s.id=m.sale_id LEFT JOIN sale_cancellations x ON x.shop_id=m.shop_id AND x.sale_id=m.sale_id WHERE m.shop_id=$1
 UNION ALL SELECT 'OLD_METAL',l.metal,l.fineness,m.movement_date,m.kind,m.net_weight_grams,m.fine_weight_grams,CASE WHEN m.net_weight_grams>0 THEN 1 ELSE -1 END FROM old_metal_movements m JOIN old_metal_lots l ON l.shop_id=m.shop_id AND l.id=m.lot_id WHERE m.shop_id=$1)
 SELECT class AS "stockClass",metal,fineness::text,COALESCE(sum(qty) FILTER(WHERE day<$2),0)::int AS "openingCount",sum(qty)::int AS "closingCount",
 COALESCE(sum(grams) FILTER(WHERE day<$2),0)::numeric(32,3)::text AS "openingGrams",COALESCE(sum(grams) FILTER(WHERE day BETWEEN $2 AND $3 AND kind IN ('RECEIPT','PURCHASE')),0)::numeric(32,3)::text AS "receivedGrams",COALESCE(-sum(grams) FILTER(WHERE day BETWEEN $2 AND $3 AND kind='SALE'),0)::numeric(32,3)::text AS "issuedGrams",COALESCE(sum(grams) FILTER(WHERE day BETWEEN $2 AND $3 AND kind IN ('RECEIPT_VOID','SALE_CANCEL','PURCHASE_CANCEL')),0)::numeric(32,3)::text AS "correctionGrams",sum(grams)::numeric(32,3)::text AS "closingGrams",sum(fine)::numeric(32,6)::text AS "closingFineGrams" FROM moves WHERE day<=$3 GROUP BY class,metal,fineness ORDER BY class,metal,fineness DESC`,
        [SHOP_ID, q.from, q.to],
      )
    ).rows;
  }
  async get(q: ReportsQuery) {
    return this.database.run(async (client) => {
      await client.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      const activity = await this.activity(client, q),
        stock = await this.stock(client, q),
        accounts = await this.accounts(client, q.to);
      const methods = await client.query(
        `WITH cash AS (${cashFacts}),methods AS (SELECT unnest(ARRAY['CASH','BANK','DIGITAL_WALLET']) AS method) SELECT m.method,COALESCE(sum(amount) FILTER(WHERE kind='RECEIPT'),0.00)::text AS "receivedNpr",COALESCE(sum(amount) FILTER(WHERE kind='PAYOUT'),0.00)::text AS "paidNpr",COALESCE(sum(CASE WHEN kind='RECEIPT' THEN amount WHEN kind='PAYOUT' THEN -amount ELSE 0 END),0.00)::text AS "netCashNpr" FROM methods m LEFT JOIN cash c ON c.method=m.method AND c.day BETWEEN $2::date AND $3::date GROUP BY m.method ORDER BY m.method`,
        [SHOP_ID, q.from, q.to],
      );
      return reportsSchema.parse({
        ...q,
        ...activity,
        stock,
        accounts,
        methods: methods.rows,
      });
    }, true);
  }
  async dashboard() {
    return this.database.run(async (client) => {
      await client.query(
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      );
      const date = nepalToday(),
        q: ReportsQuery = { from: date, to: date, groupBy: 'DAY' };
      const today = (await this.activity(client, q)).totals,
        month = (
          await this.activity(client, {
            from: `${date.slice(0, 7)}-01`,
            to: date,
            groupBy: 'MONTH',
          })
        ).totals;
      const stock = await this.stock(client, q),
        accounts = await this.accounts(client, date);
      const orders = (
        await client.query(
          `SELECT count(*) FILTER(WHERE e.status NOT IN ('DELIVERED','CANCELLED'))::int AS active,count(*) FILTER(WHERE e.status='READY')::int AS ready,count(*) FILTER(WHERE e.status NOT IN ('DELIVERED','CANCELLED') AND o.due_date<$2::date)::int AS overdue FROM custom_orders o JOIN LATERAL (SELECT status FROM custom_order_events WHERE shop_id=o.shop_id AND order_id=o.id ORDER BY version DESC LIMIT 1)e ON true WHERE o.shop_id=$1`,
          [SHOP_ID, date],
        )
      ).rows[0];
      const missing = (
        await client.query(
          `SELECT count(*)::int AS n FROM (SELECT DISTINCT metal,fineness FROM inventory_items i WHERE i.shop_id=$1 AND i.status='AVAILABLE' AND NOT EXISTS(SELECT 1 FROM metal_rates r WHERE r.shop_id=i.shop_id AND r.rate_date=$2 AND r.metal=i.metal AND r.fineness=i.fineness)) t`,
          [SHOP_ID, date],
        )
      ).rows[0].n;
      const recent = (
        await client.query(
          `SELECT * FROM (SELECT s.id,'SALE' AS kind,s.sale_code AS code,s.customer_snapshot->>'name' AS "customerName",s.sale_date::text AS date,s.total_npr AS "totalNpr",EXISTS(SELECT 1 FROM sale_cancellations x WHERE x.shop_id=s.shop_id AND x.sale_id=s.id) AS cancelled,s.created_at FROM sales s WHERE s.shop_id=$1 UNION ALL SELECT p.id,'PURCHASE',p.purchase_code,p.customer_snapshot->>'name',p.purchase_date::text,p.total_npr,EXISTS(SELECT 1 FROM purchase_cancellations x WHERE x.shop_id=p.shop_id AND x.purchase_id=p.id),p.created_at FROM metal_purchases p WHERE p.shop_id=$1) t ORDER BY created_at DESC,id LIMIT 8`,
          [SHOP_ID],
        )
      ).rows;
      return dashboardSchema.parse({
        date,
        today,
        month,
        stock,
        accounts,
        orders,
        missingRates: missing,
        recent,
      });
    }, true);
  }
}
