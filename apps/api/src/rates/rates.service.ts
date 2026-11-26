import { rateColumns as columns } from './rate-row.js';
import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  metalRateSchema,
  nepalToday,
  parseFenegosidaRates,
  rateBookSchema,
  rateHistorySchema,
  syncLatestRatesResultSchema,
  type PublishRate,
  type RateHistoryQuery,
  type RateQuery,
} from '@awesomejm/contracts';
import { DEFAULT_GRAMS_PER_TOLA } from '@awesomejm/calculations';
import { DatabaseService } from '../database/database.service.js';
import { SHOP_ID } from '../shop/shop.js';

const DEFAULT_FENEGOSIDA_URL =
  'https://api.fenegosida.org/api/website/v1/Dashboard/today';
const SYNC_FINENESS = '999';
const FETCH_TIMEOUT_MS = 10_000;
const FETCH_ERROR_MESSAGE =
  'Could not fetch latest rates from FENEGOSIDA. Please try again or set rates manually.';

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
      await this.lockRateKey(
        client,
        input.rateDate,
        input.metal,
        input.fineness,
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
      return this.insertRevision(client, {
        ...input,
        revision: revision + 1,
      });
    }, true);
  }

  async fetchLatest() {
    const endpoint = process.env.FENEGOSIDA_RATES_URL || DEFAULT_FENEGOSIDA_URL;
    let parsedRates: ReturnType<typeof parseFenegosidaRates>;
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload: unknown = await response.json();
      parsedRates = parseFenegosidaRates(payload);
    } catch {
      throw new BadGatewayException(FETCH_ERROR_MESSAGE);
    }

    const rateDate = nepalToday();
    const source = parsedRates.sourceDate
      ? `FENEGOSIDA (${parsedRates.sourceDate})`
      : 'FENEGOSIDA';

    return this.database.run(async (client) => {
      const targets: Array<{
        metal: 'GOLD' | 'SILVER';
        ratePerTola: string;
      }> = [
        { metal: 'GOLD', ratePerTola: parsedRates.goldPerTola },
        { metal: 'SILVER', ratePerTola: parsedRates.silverPerTola },
      ];
      for (const target of targets) {
        await this.lockRateKey(client, rateDate, target.metal, SYNC_FINENESS);
      }

      const syncMetal = async (
        metal: 'GOLD' | 'SILVER',
        ratePerTola: string,
      ) => {
        const latest = await client.query(
          `SELECT ${columns} FROM metal_rates WHERE shop_id = $1 AND rate_date = $2 AND metal = $3 AND fineness = $4 ORDER BY revision DESC LIMIT 1`,
          [SHOP_ID, rateDate, metal, SYNC_FINENESS],
        );
        const existing = latest.rows[0]
          ? metalRateSchema.parse(latest.rows[0])
          : null;
        if (
          existing &&
          existing.buyRatePerTola === ratePerTola &&
          existing.sellRatePerTola === ratePerTola
        ) {
          return { rate: existing, action: 'unchanged' as const };
        }
        const nextRevision = (existing?.revision ?? 0) + 1;
        const rate = await this.insertRevision(client, {
          rateDate,
          metal,
          fineness: SYNC_FINENESS,
          buyRatePerTola: ratePerTola,
          sellRatePerTola: ratePerTola,
          source,
          reason:
            nextRevision === 1 ? '' : 'Updated from latest FENEGOSIDA rate',
          revision: nextRevision,
        });
        return {
          rate,
          action: existing ? ('updated' as const) : ('created' as const),
        };
      };

      const goldResult = await syncMetal('GOLD', parsedRates.goldPerTola);
      const silverResult = await syncMetal('SILVER', parsedRates.silverPerTola);
      return syncLatestRatesResultSchema.parse({
        rateDate,
        sourceDate: parsedRates.sourceDate,
        source,
        gold: goldResult.rate,
        silver: silverResult.rate,
        goldAction: goldResult.action,
        silverAction: silverResult.action,
      });
    }, true);
  }

  private async lockRateKey(
    client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
    rateDate: string,
    metal: string,
    fineness: string,
  ) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('metal-rate:' || $1::text || ':' || $2::date::text || ':' || $3::text || ':' || $4::numeric(7,3)::text, 0))`,
      [SHOP_ID, rateDate, metal, fineness],
    );
  }

  private async insertRevision(
    client: {
      query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
    },
    input: Omit<PublishRate, 'expectedRevision'> & { revision: number },
  ) {
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
        input.revision,
      ],
    );
    return metalRateSchema.parse(result.rows[0]);
  }
}
