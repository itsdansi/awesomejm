import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';

test('inventory persists exact weights and preserves stock history', async (t) => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm';
  const admin = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  const schema = `inventory_test_${randomUUID().replaceAll('-', '')}`;
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
    migrate(); // Re-running migrations must preserve existing data.
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1/inventory`;
    async function api(path, body) {
      const response = await fetch(
        `${base}${path}`,
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
    const receipt = {
      itemCode: 'gld-001',
      name: 'सुनको औँठी',
      category: 'Ring',
      metal: 'GOLD',
      fineness: '916.667',
      grossWeightGrams: '12.664',
      nonMetalWeightGrams: '1',
      notes: 'Opening stock',
    };
    let item;

    await t.test(
      'validates on the server, including physical weight and tenant injection',
      async () => {
        for (const invalid of [
          { grossWeightGrams: '-1' },
          { grossWeightGrams: '1.0001' },
          { nonMetalWeightGrams: '12.664' },
          { fineness: '1000.001' },
          { shopId: randomUUID() },
        ]) {
          assert.equal(
            (await api('/items', { ...receipt, ...invalid })).status,
            400,
          );
        }
        assert.equal((await api('/items?page=0')).status, 400);
        assert.equal((await api('/items/not-a-uuid/history')).status, 400);
      },
    );
    await t.test(
      'receives a piece, calculates exact weights, and records one movement',
      async () => {
        const result = await api('/items', receipt);
        assert.equal(result.status, 201);
        item = result.body;
        assert.equal(item.itemCode, 'GLD-001');
        assert.equal(item.netWeightGrams, '11.664');
        assert.equal(item.fineWeightGrams, '10.692004');
        assert.equal(item.gramsPerTola, '11.66400');
        assert.equal((await api(`/items/${item.id}/history`)).body.length, 1);
        assert.equal((await api('/items?search=औँठी')).body.total, 1);
        assert.equal((await api('/items?search=%25')).body.total, 0);
        assert.equal((await api('/items?search=_')).body.total, 0);
        assert.equal((await api('/items?page=2&pageSize=1')).body.total, 1);
      },
    );
    await t.test(
      'rejects duplicate codes without adding stock or movements',
      async () => {
        const results = await Promise.all([
          api('/items', receipt),
          api('/items', receipt),
        ]);
        assert.deepEqual(
          results.map((result) => result.status),
          [409, 409],
        );
        assert.equal((await api('/items')).body.total, 1);
        assert.equal((await api(`/items/${item.id}/history`)).body.length, 1);
      },
    );
    await t.test(
      'separates gold and silver totals and scopes every read/write to the shop',
      async () => {
        await api('/items', {
          ...receipt,
          itemCode: 'SLV-001',
          metal: 'SILVER',
          fineness: '925',
          grossWeightGrams: '20',
          nonMetalWeightGrams: '0',
        });
        const otherShop = randomUUID();
        const otherItem = randomUUID();
        await db.query('INSERT INTO shops (id,name) VALUES ($1,$2)', [
          otherShop,
          'Other shop',
        ]);
        await db.query(
          `INSERT INTO inventory_items (id,shop_id,item_code,name,category,metal,fineness,gross_weight_grams,non_metal_weight_grams,grams_per_tola) VALUES ($1,$2,'PRIVATE','Other stock','Ring','GOLD',999,500,0,11.664)`,
          [otherItem, otherShop],
        );
        const summary = (await api('/summary')).body.metals;
        assert.equal(
          summary.find((row) => row.metal === 'GOLD').netWeightGrams,
          '11.664',
        );
        assert.equal(
          summary.find((row) => row.metal === 'SILVER').netWeightGrams,
          '20.000',
        );
        assert.equal((await api('/items?metal=SILVER')).body.total, 1);
        assert.equal((await api('/items?search=PRIVATE')).body.total, 0);
        assert.equal((await api(`/items/${otherItem}/history`)).status, 404);
        assert.equal(
          (
            await api(`/items/${otherItem}/void`, {
              reason: 'Attempt cross-shop access',
            })
          ).status,
          404,
        );
      },
    );
    await t.test(
      'rolls back the item if its movement cannot be posted',
      async () => {
        await db.query(
          `CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason = 'Stock received' THEN RAISE EXCEPTION 'Simulated storage failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_test BEFORE INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION fail_receipt()`,
        );
        try {
          assert.equal(
            (await api('/items', { ...receipt, itemCode: 'ROLLBACK' })).status,
            503,
          );
          assert.equal((await api('/items?search=ROLLBACK')).body.total, 0);
        } finally {
          await db.query(
            'DROP TRIGGER fail_test ON inventory_movements; DROP FUNCTION fail_receipt()',
          );
        }
      },
    );
    await t.test(
      'serializes concurrent corrections and keeps immutable history',
      async () => {
        assert.equal(
          (await api(`/items/${item.id}/void`, { reason: 'x' })).status,
          400,
        );
        const results = await Promise.all([
          api(`/items/${item.id}/void`, {
            reason: 'Incorrect opening receipt',
          }),
          api(`/items/${item.id}/void`, {
            reason: 'Duplicate correction attempt',
          }),
        ]);
        assert.deepEqual(
          results.map((result) => result.status).sort(),
          [200, 409],
        );
        const history = (await api(`/items/${item.id}/history`)).body;
        assert.equal(history.length, 2);
        assert.equal(history[1].netWeightGrams, '-11.664');
        assert.equal(
          (await api('/summary')).body.metals.some(
            (row) => row.metal === 'GOLD',
          ),
          false,
        );
        assert.equal((await api('/items?status=VOIDED')).body.total, 1);
        assert.equal((await api('/items', receipt)).status, 409);
        await assert.rejects(
          db.query(
            'UPDATE inventory_movements SET reason = $1 WHERE item_id = $2',
            ['Erase history', item.id],
          ),
          /append-only/,
        );
        await assert.rejects(
          db.query('DELETE FROM inventory_movements WHERE item_id = $1', [
            item.id,
          ]),
          /append-only/,
        );
      },
    );
    await t.test('records survive an application restart', async () => {
      await app.close();
      app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
      const response = await fetch(
        `${await app.getUrl()}/api/v1/inventory/items?status=VOIDED`,
      );
      assert.equal((await response.json()).items[0].id, item.id);
    });
  } finally {
    await app?.close();
    await db.end();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
