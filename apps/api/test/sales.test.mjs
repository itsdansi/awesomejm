import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { NestFactory } from '@nestjs/core';
import { nepalToday } from '@awesomejm/contracts';
import { AppModule } from '../dist/app.module.js';

test('sales atomically link immutable pricing, physical stock and customer accounts', async (t) => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm';
  const admin = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  const schema = `sales_test_${randomUUID().replaceAll('-', '')}`;
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
    async function start() {
      app = await NestFactory.create(AppModule, { logger: false });
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
    }
    await start();
    async function api(path, body, method = 'POST') {
      const response = await fetch(
        `${await app.getUrl()}/api/v1${path}`,
        body === undefined
          ? {}
          : {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            },
      );
      return { status: response.status, body: await response.json() };
    }
    async function success(path, body, status = 201, method = 'POST') {
      const result = await api(path, body, method);
      assert.equal(result.status, status, JSON.stringify(result.body));
      return result.body;
    }
    const today = nepalToday();
    const rateInput = {
      rateDate: today,
      metal: 'GOLD',
      fineness: '916.667',
      buyRatePerTola: '149000.10',
      sellRatePerTola: '150000.25',
      source: 'Shop test rate',
      reason: '',
      expectedRevision: 0,
    };
    let rate = await success('/rates', rateInput);
    const customerInput = {
      requestId: randomUUID(),
      name: 'परीक्षण ग्राहक',
      phone: '9800000000',
      address: 'Test address',
      pan: '123456789',
      notes: '',
      openedOn: today,
      openingType: 'ADVANCE',
      openingAmountNpr: '1000.50',
      openingReference: 'Opening advance',
    };
    const customer = await success('/customers', customerInput);
    const customer2 = await success('/customers', {
      ...customerInput,
      requestId: randomUUID(),
      name: 'Second customer',
      openingType: 'NONE',
      openingAmountNpr: '0',
    });
    const piece = {
      itemCode: 'TEST-SALE-1',
      name: 'सुनको औँठी',
      category: 'Ring',
      metal: 'GOLD',
      fineness: '916.667',
      grossWeightGrams: '12.664',
      nonMetalWeightGrams: '1',
      notes: 'Test only',
    };
    const item = await success('/inventory/items', piece);
    const item2 = await success('/inventory/items', {
      ...piece,
      itemCode: 'TEST-SALE-2',
    });
    const item3 = await success('/inventory/items', {
      ...piece,
      itemCode: 'TEST-SALE-3',
    });
    const draft = {
      customerId: customer.id,
      saleDate: today,
      lines: [
        {
          itemId: item.id,
          rateId: rate.id,
          wastageGrams: '0.116',
          makingNpr: '3000.10',
          stonesNpr: '500.25',
        },
      ],
      discountNpr: '500',
      taxNpr: '25',
      paymentNpr: '100000',
      paymentMethod: 'CASH',
      paymentReference: 'Test received',
      billReference: 'MANUAL-001',
      notes: 'Test sale',
    };
    const posting = async (input) => {
      const preview = await success('/sales/preview', input);
      return {
        ...input,
        requestId: randomUUID(),
        expectedTotalNpr: preview.totalNpr,
        expectedCustomerVersion: preview.customer.version,
        expectedBalanceNpr: preview.balanceBeforeNpr,
      };
    };
    const stock = async (id) =>
      (
        await success('/inventory/items?status=SOLD', undefined, 200)
      ).items.find((piece) => piece.id === id);
    let sale, postedInput, cancellation;

    await t.test(
      'preview is read-only and rejects bad weights, dates, ids and injected fields',
      async () => {
        const preview = await success('/sales/preview', draft);
        assert.equal(preview.totalNpr, '154517.37');
        assert.equal(preview.advanceAppliedNpr, '1000.50');
        assert.equal(preview.lines[0].metalNpr, '150000.25');
        assert.equal((await success('/sales', undefined, 200)).total, 0);
        assert.equal(
          (await success(`/customers/${customer.id}/ledger`, undefined, 200))
            .total,
          1,
        );
        for (const invalid of [
          { lines: [] },
          { lines: [draft.lines[0], draft.lines[0]] },
          { shopId: randomUUID() },
          { paymentMethod: null },
          { paymentNpr: '999999999' },
          { discountNpr: '999999999' },
          { taxNpr: '-1' },
          { saleDate: '2099-01-01' },
          { lines: [{ ...draft.lines[0], wastageGrams: '0.0001' }] },
        ]) {
          assert.equal(
            (await api('/sales/preview', { ...draft, ...invalid })).status,
            400,
            JSON.stringify(invalid),
          );
        }
        assert.equal(
          (await api('/sales/preview', { ...draft, customerId: randomUUID() }))
            .status,
          404,
        );
        assert.equal(
          (
            await api('/sales/preview', {
              ...draft,
              lines: [{ ...draft.lines[0], itemId: randomUUID() }],
            })
          ).status,
          404,
        );
        assert.equal((await api('/sales/not-a-uuid')).status, 400);
        assert.equal(
          (await api('/sales?from=2026-01-02&to=2026-01-01')).status,
          400,
        );
        assert.equal((await api('/sales?page=0')).status, 400);
        const yesterday = new Date(`${today}T12:00:00Z`);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        assert.equal(
          (
            await api('/sales/preview', {
              ...draft,
              saleDate: yesterday.toISOString().slice(0, 10),
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      'requires a reviewed current matching rate and unchanged customer balance/version/total',
      async () => {
        const input = await posting(draft);
        for (const invalid of [
          { expectedTotalNpr: '1' },
          { expectedBalanceNpr: '0' },
          { expectedCustomerVersion: 2 },
        ])
          assert.equal(
            (await api('/sales', { ...input, ...invalid })).status,
            409,
          );
        const silver = await success('/rates', {
          ...rateInput,
          metal: 'SILVER',
          fineness: '925',
          buyRatePerTola: '1500',
          sellRatePerTola: '1600',
        });
        assert.equal(
          (
            await api('/sales/preview', {
              ...draft,
              lines: [{ ...draft.lines[0], rateId: silver.id }],
            })
          ).status,
          409,
        );
        rate = await success('/rates', {
          ...rateInput,
          expectedRevision: 1,
          reason: 'Revise the test rate',
        });
        assert.equal((await api('/sales', input)).status, 409);
        draft.lines[0].rateId = rate.id;
        const stale = await posting(draft);
        await success(`/customers/${customer.id}/payments`, {
          requestId: randomUUID(),
          kind: 'PAYMENT',
          entryDate: today,
          amountNpr: '0.01',
          method: 'CASH',
          reference: 'Concurrent advance',
          notes: '',
        });
        assert.equal((await api('/sales', stale)).status, 409);
        await success(
          `/customers/${customer.id}`,
          {
            name: 'Updated test name',
            expectedVersion: 1,
            reason: 'Update profile during checkout',
          },
          200,
          'PATCH',
        );
        assert.equal(
          (await api('/sales', { ...stale, expectedBalanceNpr: '-1000.51' }))
            .status,
          409,
        );
      },
    );
    await t.test(
      'posts once under concurrent retries and stores physical net movement without billed wastage',
      async () => {
        postedInput = await posting(draft);
        const attempts = await Promise.all([
          api('/sales', postedInput),
          api('/sales', postedInput),
        ]);
        for (const result of attempts)
          assert.equal(result.status, 201, JSON.stringify(result.body));
        sale = attempts[0].body;
        assert.deepEqual(sale, attempts[1].body);
        assert.equal(sale.sale.saleCode, 'S-000001');
        assert.equal(sale.sale.totalNpr, '154517.37');
        assert.equal(sale.sale.balanceAfterNpr, '53516.86');
        assert.equal(sale.sale.dueAtPostingNpr, '53516.86');
        assert.equal(sale.sale.customerSnapshot.name, 'Updated test name');
        assert.equal((await stock(item.id)).activeSaleId, sale.sale.id);
        const movements = await success(
          `/inventory/items/${item.id}/history`,
          undefined,
          200,
        );
        assert.equal(movements.length, 2);
        assert.equal(
          movements.find((entry) => entry.kind === 'SALE').netWeightGrams,
          '-11.664',
        );
        assert.equal(
          movements.find((entry) => entry.kind === 'SALE').saleId,
          sale.sale.id,
        );
        const ledger = await success(
          `/customers/${customer.id}/ledger`,
          undefined,
          200,
        );
        const entries = ledger.items.filter(
          (entry) => entry.saleId === sale.sale.id,
        );
        assert.equal(entries.length, 2);
        assert.equal(
          entries.find((entry) => entry.kind === 'SALE_CHARGE').amountNpr,
          '154517.37',
        );
        assert.equal(
          entries.find((entry) => entry.kind === 'PAYMENT').amountNpr,
          '-100000.00',
        );
        assert.equal(ledger.customer.balanceNpr, '53516.86');
        assert.equal(
          (await api('/sales', { ...postedInput, notes: 'Different request' }))
            .status,
          409,
        );
        assert.equal((await api('/sales/preview', draft)).status, 409);
        assert.equal(
          (
            await api(`/inventory/items/${item.id}/void`, {
              reason: 'Void sold stock',
            })
          ).status,
          409,
        );
        for (const entry of entries)
          assert.equal(
            (
              await api(
                `/customers/${customer.id}/entries/${entry.id}/reverse`,
                {
                  requestId: randomUUID(),
                  entryDate: today,
                  reason: 'Independent reversal attempt',
                },
              )
            ).status,
            409,
          );
        const available = await success(
          '/inventory/items?status=AVAILABLE',
          undefined,
          200,
        );
        assert.equal(
          available.items.some((piece) => piece.id === item.id),
          false,
        );
      },
    );
    await t.test(
      'two customers cannot buy the same piece concurrently',
      async () => {
        const forItem = {
          ...draft,
          paymentNpr: '0',
          paymentMethod: null,
          lines: [{ ...draft.lines[0], itemId: item2.id }],
        };
        const inputs = await Promise.all([
          posting(forItem),
          posting({ ...forItem, customerId: customer2.id }),
        ]);
        const results = await Promise.all(
          inputs.map((input) => api('/sales', input)),
        );
        assert.deepEqual(
          results.map((result) => result.status).sort(),
          [201, 409],
        );
        assert.equal(
          (
            await success(
              `/inventory/items/${item2.id}/history`,
              undefined,
              200,
            )
          ).filter((entry) => entry.kind === 'SALE').length,
          1,
        );
      },
    );
    await t.test(
      'late account failure rolls back sale, stock, movements and numbering',
      async () => {
        const input = await posting({
          ...draft,
          customerId: customer2.id,
          lines: [{ ...draft.lines[0], itemId: item3.id }],
          billReference: 'FAIL_SALE',
        });
        const before = (
          await db.query(
            'SELECT scope,last_number::text FROM shop_counters ORDER BY scope',
          )
        ).rows;
        const saleCount = (
          await db.query('SELECT count(*)::int AS n FROM sales')
        ).rows[0].n;
        await db.query(
          `CREATE FUNCTION fail_sale() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'SALE_CHARGE' THEN RAISE EXCEPTION 'Simulated late failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_test BEFORE INSERT ON customer_account_entries FOR EACH ROW EXECUTE FUNCTION fail_sale()`,
        );
        try {
          assert.equal((await api('/sales', input)).status, 503);
          assert.equal(
            (await db.query('SELECT count(*)::int AS n FROM sales')).rows[0].n,
            saleCount,
          );
          assert.deepEqual(
            (
              await db.query(
                'SELECT scope,last_number::text FROM shop_counters ORDER BY scope',
              )
            ).rows,
            before,
          );
          assert.equal(
            (
              await success(
                `/inventory/items/${item3.id}/history`,
                undefined,
                200,
              )
            ).length,
            1,
          );
          assert.equal(await stock(item3.id), undefined);
        } finally {
          await db.query(
            'DROP TRIGGER fail_test ON customer_account_entries; DROP FUNCTION fail_sale()',
          );
        }
        const saved = await success('/sales', input);
        assert.equal(saved.lines[0].item.id, item3.id);
      },
    );
    await t.test(
      'cancellation reverses both linked entries once, restores stock and preserves original snapshots',
      async () => {
        cancellation = {
          requestId: randomUUID(),
          cancellationDate: today,
          reason: 'Erroneous test entry, pieces still in shop',
          confirmStockInShop: true,
        };
        assert.equal(
          (
            await api(`/sales/${sale.sale.id}/cancel`, {
              ...cancellation,
              confirmStockInShop: false,
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await api(`/sales/${sale.sale.id}/cancel`, {
              ...cancellation,
              reason: 'x',
            })
          ).status,
          400,
        );
        // A failure after stock restoration must roll that restoration back as well.
        await db.query(
          `CREATE FUNCTION fail_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'REVERSAL' THEN RAISE EXCEPTION 'Simulated reversal failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_test BEFORE INSERT ON customer_account_entries FOR EACH ROW EXECUTE FUNCTION fail_cancellation()`,
        );
        try {
          assert.equal(
            (await api(`/sales/${sale.sale.id}/cancel`, cancellation)).status,
            503,
          );
          assert.equal((await stock(item.id)).activeSaleId, sale.sale.id);
          assert.equal(
            (await success(`/sales/${sale.sale.id}`, undefined, 200)).sale
              .status,
            'POSTED',
          );
        } finally {
          await db.query(
            'DROP TRIGGER fail_test ON customer_account_entries; DROP FUNCTION fail_cancellation()',
          );
        }
        const balanceBefore = (
          await success(`/customers/${customer.id}`, undefined, 200)
        ).customer.balanceNpr;
        const results = await Promise.all([
          api(`/sales/${sale.sale.id}/cancel`, cancellation),
          api(`/sales/${sale.sale.id}/cancel`, cancellation),
        ]);
        for (const result of results)
          assert.equal(result.status, 201, JSON.stringify(result.body));
        assert.deepEqual(results[0], results[1]);
        assert.equal(results[0].body.sale.status, 'CANCELLED');
        assert.deepEqual(results[0].body.lines, sale.lines);
        assert.equal(results[0].body.sale.totalNpr, sale.sale.totalNpr);
        const after = (
          await success(`/customers/${customer.id}`, undefined, 200)
        ).customer.balanceNpr;
        const toCents = (value) => BigInt(value.replace('.', ''));
        assert.equal(toCents(balanceBefore) - toCents(after), 5451737n);
        const ledger = await success(
          `/customers/${customer.id}/ledger`,
          undefined,
          200,
        );
        const linked = ledger.items.filter(
          (entry) => entry.saleId === sale.sale.id,
        );
        assert.equal(linked.length, 4);
        for (const original of linked.filter(
          (entry) => entry.kind !== 'REVERSAL',
        )) {
          assert.equal(original.reversed, true);
          assert.equal(
            toCents(original.amountNpr) +
              toCents(
                linked.find((entry) => entry.reversalOf === original.id)
                  .amountNpr,
              ),
            0n,
          );
        }
        assert.equal(
          (
            await api(`/sales/${sale.sale.id}/cancel`, {
              ...cancellation,
              requestId: randomUUID(),
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await api(`/sales/${sale.sale.id}/cancel`, {
              ...cancellation,
              reason: 'Different reason',
            })
          ).status,
          409,
        );
        assert.equal(
          (await success('/sales', postedInput)).sale.status,
          'CANCELLED',
        );
        const history = await success(
          `/inventory/items/${item.id}/history`,
          undefined,
          200,
        );
        assert.equal(
          history.find((entry) => entry.kind === 'SALE_CANCEL').netWeightGrams,
          '11.664',
        );
        const available = await success(
          `/inventory/items?status=AVAILABLE&search=${item.itemCode}`,
          undefined,
          200,
        );
        assert.equal(available.items[0].activeSaleId, null);
      },
    );
    await t.test(
      'cancelled pieces can be sold again with a new linked history',
      async () => {
        const resell = await success(
          '/sales',
          await posting({
            ...draft,
            customerId: customer2.id,
            paymentNpr: '0',
            paymentMethod: null,
          }),
        );
        assert.equal((await stock(item.id)).activeSaleId, resell.sale.id);
        const history = await success(
          `/inventory/items/${item.id}/history`,
          undefined,
          200,
        );
        assert.equal(
          history.filter((entry) => entry.kind === 'SALE').length,
          2,
        );
        assert.equal(
          (
            await api(`/sales/${sale.sale.id}/cancel`, {
              ...cancellation,
              requestId: randomUUID(),
            })
          ).status,
          409,
        );
        assert.equal((await stock(item.id)).activeSaleId, resell.sale.id);
      },
    );
    await t.test(
      'register filters, summary, immutable history and shop scoping stay consistent after restart',
      async () => {
        assert.equal(
          (await success('/sales?status=CANCELLED', undefined, 200)).total,
          1,
        );
        assert.equal(
          (await success('/sales?search=S-000001', undefined, 200)).items[0].id,
          sale.sale.id,
        );
        assert.equal(
          (await success('/sales?search=%25', undefined, 200)).total,
          0,
        );
        const empty = await success(
          '/sales?page=100&pageSize=1',
          undefined,
          200,
        );
        assert.equal(empty.items.length, 0);
        assert.equal(empty.total, 4);
        const summary = await success('/sales/summary', undefined, 200);
        assert.equal(summary.posted, 3);
        assert.equal(summary.cancelled, 1);
        assert.equal(summary.postedTotalNpr, '463552.11');
        for (const table of ['sales', 'sale_lines', 'sale_cancellations']) {
          const key = table === 'sales' ? 'id' : 'sale_id';
          await assert.rejects(
            db.query(`DELETE FROM ${table} WHERE ${key}=$1`, [sale.sale.id]),
            /append-only/,
          );
        }
        await assert.rejects(
          db.query('UPDATE sales SET notes=$1 WHERE id=$2', [
            'Erase',
            sale.sale.id,
          ]),
          /append-only/,
        );
        const otherShop = randomUUID(),
          otherCustomer = randomUUID(),
          otherItem = randomUUID();
        await db.query('INSERT INTO shops(id,name) VALUES($1,$2)', [
          otherShop,
          'Other shop',
        ]);
        await db.query(
          `INSERT INTO customers(id,shop_id,customer_code,name,opened_on,create_request_id,request_fingerprint) VALUES($1,$2,'PRIVATE','Private customer',$3,$4,$5)`,
          [otherCustomer, otherShop, today, randomUUID(), '0'.repeat(64)],
        );
        await db.query(
          `INSERT INTO inventory_items(id,shop_id,item_code,name,category,metal,fineness,gross_weight_grams,non_metal_weight_grams,grams_per_tola) SELECT $1,$2,'PRIVATE',name,category,metal,fineness,gross_weight_grams,non_metal_weight_grams,grams_per_tola FROM inventory_items WHERE id=$3`,
          [otherItem, otherShop, item.id],
        );
        assert.equal(
          (await api('/sales/preview', { ...draft, customerId: otherCustomer }))
            .status,
          404,
        );
        assert.equal(
          (
            await api('/sales/preview', {
              ...draft,
              lines: [{ ...draft.lines[0], itemId: otherItem }],
            })
          ).status,
          404,
        );
        await db.query(
          `INSERT INTO sales(id,shop_id,customer_id,sale_code,sale_date,customer_snapshot,subtotal_npr,discount_npr,tax_npr,total_npr,payment_npr,advance_applied_npr,due_at_posting_npr,balance_before_npr,balance_after_npr,request_id,request_fingerprint) VALUES($1,$2,$3,'PRIVATE',$4,'{}',1,0,0,1,0,0,1,0,1,$5,$6)`,
          [
            randomUUID(),
            otherShop,
            otherCustomer,
            today,
            randomUUID(),
            '0'.repeat(64),
          ],
        );
        const privateSale = (
          await db.query('SELECT id FROM sales WHERE shop_id=$1', [otherShop])
        ).rows[0].id;
        assert.equal((await api(`/sales/${privateSale}`)).status, 404);
        assert.equal(
          (
            await api(`/sales/${privateSale}/cancel`, {
              ...cancellation,
              requestId: randomUUID(),
            })
          ).status,
          404,
        );
        assert.equal(
          (await success('/sales?search=PRIVATE', undefined, 200)).total,
          0,
        );
        await app.close();
        await start();
        assert.equal(
          (await success(`/sales/${sale.sale.id}`, undefined, 200)).sale.status,
          'CANCELLED',
        );
        assert.deepEqual(
          await success('/sales/summary', undefined, 200),
          summary,
        );
        assert.equal((await stock(item.id)).status, 'SOLD');
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
