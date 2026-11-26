import { authenticatedFetch } from './helpers/auth.mjs';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import pg from 'pg';
import { NestFactory } from '@nestjs/core';
import { nepalToday } from '@awesomejm/contracts';
import { AppModule } from '../dist/app.module.js';

test('rate book preserves exact quotes and revision history', async (t) => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm';
  const admin = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  const schema = `rates_test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(connectionString);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url.toString();
  const db = new pg.Pool({ connectionString: url.toString() });
  let app;
  try {
    const migrate = () =>
      execFileSync(process.execPath, ['scripts/migrate.mjs'], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, DATABASE_URL: url.toString() },
      });
    migrate();
    migrate();
    const fetch = await authenticatedFetch(db);
    async function start() {
      app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
    }
    await start();
    async function api(path = '', body) {
      const response = await fetch(
        `${await app.getUrl()}/api/v1/rates${path}`,
        body === undefined
          ? {}
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            },
      );
      return { status: response.status, body: await response.json() };
    }
    const quote = {
      rateDate: '2026-01-15',
      metal: 'GOLD',
      fineness: '916.667',
      buyRatePerTola: '150000.10',
      sellRatePerTola: '151000.25',
      source: 'Shop-set rate',
      reason: '',
      expectedRevision: 0,
    };
    let original;

    await t.test('uses Nepal calendar dates at the UTC day boundary', () => {
      assert.equal(nepalToday(new Date('2026-10-19T18:14:59Z')), '2026-10-19');
      assert.equal(nepalToday(new Date('2026-10-19T18:15:00Z')), '2026-10-20');
    });
    await t.test(
      'rejects invalid dates, precision, unknown fields and missing revision reasons',
      async () => {
        for (const invalid of [
          { buyRatePerTola: '0' },
          { sellRatePerTola: '-1' },
          { buyRatePerTola: '150000.101' },
          { fineness: '1000.001' },
          { fineness: '916.6667' },
          { rateDate: '2026-02-30' },
          { rateDate: '2099-12-31' },
          { source: ' ' },
          { expectedRevision: 1 },
          { shopId: randomUUID() },
          { currency: 'USD' },
        ]) {
          assert.equal(
            (await api('', { ...quote, ...invalid })).status,
            400,
            JSON.stringify(invalid),
          );
        }
        assert.equal((await api('?date=invalid')).status, 400);
        assert.equal(
          (await api('/history?from=2026-02-02&to=2026-01-01')).status,
          400,
        );
        assert.equal((await api('/history?pageSize=101')).status, 400);
      },
    );
    await t.test(
      'publishes exact NPR amounts without applying a second purity adjustment',
      async () => {
        const result = await api('', quote);
        assert.equal(result.status, 201);
        original = result.body;
        assert.equal(original.buyRatePerTola, '150000.10');
        assert.equal(original.sellRatePerTola, '151000.25');
        assert.equal(original.fineness, '916.667');
        assert.equal(original.gramsPerTola, '11.66400');
        assert.equal(original.currency, 'NPR');
        assert.equal(original.revision, 1);
        assert.equal(
          (await api('?date=2026-01-15')).body.rates[0].id,
          original.id,
        );
        assert.deepEqual((await api('?date=2026-01-16')).body.rates, []);
      },
    );
    await t.test(
      'normalizes purity and rejects stale revisions, including simultaneous submissions',
      async () => {
        const revision = {
          ...quote,
          fineness: '916.667',
          buyRatePerTola: '150100.20',
          expectedRevision: 1,
          reason: 'Updated shop quote',
        };
        const results = await Promise.all([
          api('', revision),
          api('', revision),
        ]);
        assert.deepEqual(
          results.map((result) => result.status).sort(),
          [201, 409],
        );
        const book = (await api('?date=2026-01-15')).body.rates;
        assert.equal(book.length, 1);
        assert.equal(book[0].revision, 2);
        assert.equal(book[0].buyRatePerTola, '150100.20');
        assert.equal((await api('', quote)).status, 409);
        const first = await api('', {
          ...quote,
          metal: 'SILVER',
          fineness: '925.0',
          buyRatePerTola: '2000',
          sellRatePerTola: '2100',
        });
        assert.equal(first.status, 201);
        assert.equal(
          (
            await api('', {
              ...quote,
              metal: 'SILVER',
              fineness: '925',
              expectedRevision: 0,
            })
          ).status,
          409,
        );
        const create = { ...quote, fineness: '999', expectedRevision: 0 };
        const initialResults = await Promise.all([
          api('', create),
          api('', create),
        ]);
        assert.deepEqual(
          initialResults.map((result) => result.status).sort(),
          [201, 409],
        );
      },
    );
    await t.test(
      'filters history, keeps original values and handles empty pagination',
      async () => {
        const history = (
          await api(
            '/history?from=2026-01-15&to=2026-01-15&metal=GOLD&fineness=916.667',
          )
        ).body;
        assert.equal(history.total, 2);
        assert.equal(history.items[0].revision, 2);
        assert.equal(
          history.items.find((rate) => rate.revision === 1).buyRatePerTola,
          '150000.10',
        );
        assert.equal(
          history.items.find((rate) => rate.revision === 2).reason,
          'Updated shop quote',
        );
        const emptyPage = (
          await api('/history?metal=GOLD&fineness=916.667&pageSize=1&page=3')
        ).body;
        assert.equal(emptyPage.total, 2);
        assert.deepEqual(emptyPage.items, []);
        assert.equal(
          (await api('?date=2026-01-15&metal=SILVER')).body.rates.length,
          1,
        );
        assert.equal((await api('/history?to=2026-01-14')).body.total, 0);
      },
    );
    await t.test(
      'isolates shops and blocks mutation or deletion of history',
      async () => {
        const shopId = randomUUID();
        await db.query('INSERT INTO shops(id,name) VALUES($1,$2)', [
          shopId,
          'Other shop',
        ]);
        await db.query(
          `INSERT INTO metal_rates(id,shop_id,rate_date,metal,fineness,buy_rate_per_tola,sell_rate_per_tola,grams_per_tola,source,revision) VALUES($1,$2,'2026-01-15','GOLD',750,100,200,11.664,'Other shop private quote',1)`,
          [randomUUID(), shopId],
        );
        assert.equal(
          (await api('?date=2026-01-15')).body.rates.some(
            (rate) => rate.fineness === '750.000',
          ),
          false,
        );
        assert.equal((await api('/history?fineness=750')).body.total, 0);
        await assert.rejects(
          db.query('UPDATE metal_rates SET source = $1 WHERE id = $2', [
            'Changed',
            original.id,
          ]),
          /append-only/,
        );
        await assert.rejects(
          db.query('DELETE FROM metal_rates WHERE id = $1', [original.id]),
          /append-only/,
        );
      },
    );
    await t.test('preserves rates across application restarts', async () => {
      await app.close();
      await start();
      assert.equal(
        (await api('?date=2026-01-15&metal=GOLD')).body.rates.find(
          (rate) => rate.fineness === '916.667',
        ).revision,
        2,
      );
    });

    await t.test(
      'fetches latest FENEGOSIDA gold and silver rates and updates existing today rates',
      async () => {
        let mode = 'initial';
        const server = createServer((_req, res) => {
          if (mode === 'error') {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'unavailable' }));
            return;
          }
          const gold = mode === 'initial' ? 241400 : 242500;
          const silver = mode === 'initial' ? 3040 : 3100;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify([
              {
                id: 1,
                todayDate: '2026-11-25T04:57:44.7+00:00',
                rateType: 'छापावाल सुन (१० ग्राम)',
                todayBaseRatePerGram: 206960,
              },
              {
                id: 2,
                todayDate: '2026-11-25T04:57:44.7+00:00',
                rateType: 'छापावाल सुन (१ तोला)',
                todayBaseRatePerGram: gold,
              },
              {
                id: 3,
                todayDate: '2026-11-25T04:57:44.7+00:00',
                rateType: 'असली चाँदी दर (१० ग्राम)',
                todayBaseRatePerGram: 2606.5,
              },
              {
                id: 4,
                todayDate: '2026-11-25T04:57:44.7+00:00',
                rateType: 'असली चाँदी दर (१ तोला)',
                todayBaseRatePerGram: silver,
              },
            ]),
          );
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        const previousUrl = process.env.FENEGOSIDA_RATES_URL;
        process.env.FENEGOSIDA_RATES_URL = `http://127.0.0.1:${address.port}/today`;
        try {
          const today = nepalToday();
          const first = await api('/fetch-latest', {});
          assert.equal(first.status, 201);
          assert.equal(first.body.rateDate, today);
          assert.equal(first.body.sourceDate, '2026-11-25');
          assert.equal(first.body.source, 'FENEGOSIDA (2026-11-25)');
          assert.equal(first.body.goldAction, 'created');
          assert.equal(first.body.silverAction, 'created');
          assert.equal(first.body.gold.fineness, '999.000');
          assert.equal(first.body.gold.buyRatePerTola, '241400.00');
          assert.equal(first.body.gold.sellRatePerTola, '241400.00');
          assert.equal(first.body.gold.revision, 1);
          assert.equal(first.body.silver.fineness, '999.000');
          assert.equal(first.body.silver.buyRatePerTola, '3040.00');
          assert.equal(first.body.silver.sellRatePerTola, '3040.00');
          assert.equal(first.body.silver.revision, 1);

          // Re-fetching identical prices does not append redundant revisions.
          const same = await api('/fetch-latest', {});
          assert.equal(same.status, 201);
          assert.equal(same.body.goldAction, 'unchanged');
          assert.equal(same.body.silverAction, 'unchanged');
          assert.equal(same.body.gold.revision, 1);
          assert.equal(same.body.silver.revision, 1);

          // Updated market prices append revision 2 for today's existing rates.
          mode = 'updated';
          const updated = await api('/fetch-latest', {});
          assert.equal(updated.status, 201);
          assert.equal(updated.body.goldAction, 'updated');
          assert.equal(updated.body.silverAction, 'updated');
          assert.equal(updated.body.gold.buyRatePerTola, '242500.00');
          assert.equal(updated.body.gold.sellRatePerTola, '242500.00');
          assert.equal(updated.body.gold.revision, 2);
          assert.equal(updated.body.silver.buyRatePerTola, '3100.00');
          assert.equal(updated.body.silver.sellRatePerTola, '3100.00');
          assert.equal(updated.body.silver.revision, 2);

          const todayBook = (await api(`?date=${today}`)).body.rates;
          assert.equal(
            todayBook.find(
              (r) => r.metal === 'GOLD' && r.fineness === '999.000',
            ).revision,
            2,
          );
          assert.equal(
            todayBook.find(
              (r) => r.metal === 'SILVER' && r.fineness === '999.000',
            ).revision,
            2,
          );

          // Upstream errors fail with 502 and keep existing rates intact.
          mode = 'error';
          const failed = await api('/fetch-latest', {});
          assert.equal(failed.status, 502);
        } finally {
          if (previousUrl === undefined)
            delete process.env.FENEGOSIDA_RATES_URL;
          else process.env.FENEGOSIDA_RATES_URL = previousUrl;
          await new Promise((resolve) => server.close(resolve));
        }
      },
    );
  } finally {
    await app?.close();
    await db.end();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
