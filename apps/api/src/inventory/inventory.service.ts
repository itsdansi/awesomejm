import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  inventoryHistorySchema,
  inventoryItemSchema,
  inventoryListSchema,
  inventorySummarySchema,
  type InventoryQuery,
  type ReceiveItem,
} from '@awesomejm/contracts';
import { DEFAULT_GRAMS_PER_TOLA } from '@awesomejm/calculations';
import { DatabaseService } from '../database/database.service.js';

const SHOP_ID = '00000000-0000-4000-8000-000000000001';
// Shop identity is resolved by the server. Authenticated shop selection will replace
// this single-shop configuration before multiple customers can use the service.
const columns = `id, item_code AS "itemCode", name, category, metal, fineness,
  gross_weight_grams AS "grossWeightGrams", non_metal_weight_grams AS "nonMetalWeightGrams",
  net_weight_grams AS "netWeightGrams", fine_weight_grams AS "fineWeightGrams",
  grams_per_tola AS "gramsPerTola", notes, status,
  to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "receivedAt"`;

@Injectable()
export class InventoryService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: InventoryQuery) {
    return this.database.run(async (client) => {
      const values = [
        SHOP_ID,
        query.status,
        query.metal ?? null,
        `%${query.search.replace(/[\\%_]/g, '\\$&')}%`,
      ];
      const where = `shop_id = $1 AND status = $2 AND ($3::text IS NULL OR metal = $3) AND (item_code ILIKE $4 OR name ILIKE $4 OR category ILIKE $4)`;
      const result = await client.query(
        `SELECT ${columns}, count(*) OVER()::int AS "totalCount" FROM inventory_items WHERE ${where} ORDER BY received_at DESC, id DESC LIMIT $5 OFFSET $6`,
        [...values, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const count = result.rows.length
        ? result.rows[0].totalCount
        : (
            await client.query(
              `SELECT count(*)::int AS count FROM inventory_items WHERE ${where}`,
              values,
            )
          ).rows[0].count;
      return inventoryListSchema.parse({
        items: result.rows,
        total: count,
        page: query.page,
        pageSize: query.pageSize,
      });
    });
  }

  async summary() {
    return this.database.run(async (client) => {
      const result = await client.query(
        `SELECT metal, count(*)::int AS pieces, sum(net_weight_grams)::text AS "netWeightGrams", sum(fine_weight_grams)::text AS "fineWeightGrams" FROM inventory_items WHERE shop_id = $1 AND status = 'AVAILABLE' GROUP BY metal ORDER BY metal`,
        [SHOP_ID],
      );
      return inventorySummarySchema.parse({ metals: result.rows });
    });
  }

  async receive(input: ReceiveItem) {
    return this.database.run(async (client) => {
      const result = await client.query(
        `INSERT INTO inventory_items (id, shop_id, item_code, name, category, metal, fineness, gross_weight_grams, non_metal_weight_grams, grams_per_tola, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${columns}`,
        [
          randomUUID(),
          SHOP_ID,
          input.itemCode,
          input.name,
          input.category,
          input.metal,
          input.fineness,
          input.grossWeightGrams,
          input.nonMetalWeightGrams,
          DEFAULT_GRAMS_PER_TOLA,
          input.notes,
        ],
      );
      const item = inventoryItemSchema.parse(result.rows[0]);
      await client.query(
        `INSERT INTO inventory_movements (id, shop_id, item_id, kind, net_weight_grams, reason) VALUES ($1,$2,$3,'RECEIPT',$4,$5)`,
        [randomUUID(), SHOP_ID, item.id, item.netWeightGrams, 'Stock received'],
      );
      return item;
    }, true);
  }

  async history(id: string) {
    return this.database.run(async (client) => {
      const exists = await client.query(
        'SELECT 1 FROM inventory_items WHERE shop_id = $1 AND id = $2',
        [SHOP_ID, id],
      );
      if (!exists.rowCount) throw new NotFoundException('Item not found.');
      const result = await client.query(
        `SELECT id, kind, net_weight_grams AS "netWeightGrams", reason, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM inventory_movements WHERE shop_id = $1 AND item_id = $2 ORDER BY created_at, id`,
        [SHOP_ID, id],
      );
      return inventoryHistorySchema.parse(result.rows);
    });
  }

  async voidReceipt(id: string, reason: string) {
    return this.database.run(async (client) => {
      const result = await client.query(
        `SELECT ${columns} FROM inventory_items WHERE shop_id = $1 AND id = $2 FOR UPDATE`,
        [SHOP_ID, id],
      );
      if (!result.rowCount) throw new NotFoundException('Item not found.');
      const item = inventoryItemSchema.parse(result.rows[0]);
      if (item.status !== 'AVAILABLE')
        throw new ConflictException('This receipt has already been voided.');
      await client.query(
        `INSERT INTO inventory_movements (id, shop_id, item_id, kind, net_weight_grams, reason) VALUES ($1,$2,$3,'RECEIPT_VOID',-$4::numeric,$5)`,
        [randomUUID(), SHOP_ID, id, item.netWeightGrams, reason],
      );
      const updated = await client.query(
        `UPDATE inventory_items SET status = 'VOIDED' WHERE shop_id = $1 AND id = $2 RETURNING ${columns}`,
        [SHOP_ID, id],
      );
      return inventoryItemSchema.parse(updated.rows[0]);
    }, true);
  }
}
