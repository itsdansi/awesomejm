import { rateColumns as columns } from './rate-row.js';
import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import {
  metalRateSchema,
  rateBookSchema,
  rateHistorySchema,
  type PublishRate,
  type RateHistoryQuery,
  type RateQuery,
} from '@awesomejm/contracts';
import { DEFAULT_GRAMS_PER_TOLA } from '@awesomejm/calculations';
import { DatabaseService } from '../database/database.service.js';
import { SHOP_ID } from '../shop/shop.js';

@Injectable()
export class RatesService {
  constructor(private readonly database: DatabaseService) {}

  async book(query: RateQuery) {
    return this.database.run(async (client) => {
      const result = await client.query(
        `SELECT DISTINCT ON (metal, fineness) ${columns} FROM metal_rates WHERE shop_id = $1 AND rate_date = $2 AND ($3::text IS NULL OR metal = $3) ORDER BY metal, fineness DESC, revision DESC`,
        [SHOP_ID, query.date, query.metal ?? null],
      );
      return rateBookSchema.parse({ date: query.date, rates: result.rows });
    });
  }

  async history(query: RateHistoryQuery) {
    return this.database.run(async (client) => {
      const values = [
        SHOP_ID,
        query.from ?? null,
        query.to ?? null,
        query.metal ?? null,
        query.fineness ?? null,
      ];
      const where = `shop_id = $1 AND ($2::date IS NULL OR rate_date >= $2) AND ($3::date IS NULL OR rate_date <= $3) AND ($4::text IS NULL OR metal = $4) AND ($5::numeric IS NULL OR fineness = $5)`;
      const result = await client.query(
        `SELECT ${columns}, count(*) OVER()::int AS "totalCount" FROM metal_rates WHERE ${where} ORDER BY rate_date DESC, metal, fineness DESC, revision DESC, id DESC LIMIT $6 OFFSET $7`,
        [...values, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const total = result.rows.length
        ? result.rows[0].totalCount
        : (
            await client.query(
              `SELECT count(*)::int AS count FROM metal_rates WHERE ${where}`,
              values,
            )
          ).rows[0].count;
      return rateHistorySchema.parse({
        items: result.rows,
        total,
        page: query.page,
        pageSize: query.pageSize,
      });
    });
  }

  async publish(input: PublishRate) {
    return this.database.run(async (client) => {
      // Lock the normalized business key even when no row exists yet. The expected
      // revision makes concurrent edits explicit instead of silently overwriting.
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('metal-rate:' || $1::text || ':' || $2::date::text || ':' || $3::text || ':' || $4::numeric(7,3)::text, 0))`,
        [SHOP_ID, input.rateDate, input.metal, input.fineness],
      );
      const latest = await client.query(
        'SELECT revision FROM metal_rates WHERE shop_id = $1 AND rate_date = $2 AND metal = $3 AND fineness = $4 ORDER BY revision DESC LIMIT 1',
        [SHOP_ID, input.rateDate, input.metal, input.fineness],
      );
      const revision: number = latest.rows[0]?.revision ?? 0;
      if (revision !== input.expectedRevision)
        throw new ConflictException(
          'This rate has changed or already exists. Close this form and refresh the rate book before trying again.',
        );
      const result = await client.query(
        `INSERT INTO metal_rates (id, shop_id, rate_date, metal, fineness, buy_rate_per_tola, sell_rate_per_tola, grams_per_tola, source, reason, revision) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${columns}`,
        [
          randomUUID(),
          SHOP_ID,
          input.rateDate,
          input.metal,
          input.fineness,
          input.buyRatePerTola,
          input.sellRatePerTola,
          DEFAULT_GRAMS_PER_TOLA,
          input.source,
          input.reason,
          revision + 1,
        ],
      );
      return metalRateSchema.parse(result.rows[0]);
    }, true);
  }
}
