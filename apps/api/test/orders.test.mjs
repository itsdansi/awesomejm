import { authenticatedFetch } from './helpers/auth.mjs';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { NestFactory } from '@nestjs/core';
import { nepalToday } from '@awesomejm/contracts';
import { AppModule } from '../dist/app.module.js';

test('custom orders retain specifications, track advances and deliver atomically through Sales', async (t) => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm';
  const admin = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  const schema = `orders_test_${randomUUID().replaceAll('-', '')}`;
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
    async function ok(path, body, status = 201, method = 'POST') {
      const result = await api(path, body, method);
      assert.equal(
        result.status,
        status,
        `${path}: ${JSON.stringify(result.body)}`,
      );
      return result.body;
    }
    const today = nepalToday(),
      yesterday = new Date(`${today}T12:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const prior = yesterday.toISOString().slice(0, 10);
    const customerInput = {
      requestId: randomUUID(),
      name: 'परीक्षण ग्राहक',
      phone: '9800000000',
      address: 'Test address',
      pan: '',
      notes: '',
      openedOn: '2026-01-01',
      openingType: 'NONE',
      openingAmountNpr: '0',
      openingReference: '',
    };
    const customer = await ok('/customers', customerInput),
      otherCustomer = await ok('/customers', {
        ...customerInput,
        requestId: randomUUID(),
        name: 'Other customer',
      });
    const spec = {
      name: 'Custom ring',
      design: 'Floral pattern, polished finish',
      size: '16',
      metal: 'GOLD',
      fineness: '916.667',
      quantity: 1,
      expectedNetWeightGrams: '10',
    };
    const silverSpec = {
      ...spec,
      name: 'चाँदीको बाला',
      metal: 'SILVER',
      fineness: '925',
      design: 'Plain polished band',
      size: '2.4',
      expectedNetWeightGrams: '12',
    };
    const booking = {
      requestId: randomUUID(),
      customerId: customer.id,
      orderDate: today,
      dueDate: today,
      lines: [spec, silverSpec],
      estimatedTotalNpr: '151000',
      notes: 'Test booking',
      deposit: {
        amountNpr: '5000.25',
        method: 'CASH',
        reference: 'Test advance',
      },
    };
    const get = async (id) => await ok(`/orders/${id}`, undefined, 200);
    let detail, initialPayment, delivery;
    await t.test(
      'validates specifications, money, dates and server-controlled fields',
      async () => {
        for (const invalid of [
          { lines: [] },
          { lines: [{ ...spec, quantity: 21 }] },
          { lines: [{ ...spec, quantity: 20 }, silverSpec] },
          { lines: [{ ...spec, expectedNetWeightGrams: '-1' }] },
          { lines: [{ ...spec, fineness: '1001' }] },
          { lines: [{ ...spec, design: '' }] },
          { orderDate: '2099-01-01' },
          { dueDate: prior },
          { estimatedTotalNpr: '1.001' },
          { deposit: { amountNpr: '1', method: null, reference: '' } },
          { status: 'DELIVERED' },
          { shopId: randomUUID() },
        ])
          assert.equal(
            (await api('/orders', { ...booking, ...invalid })).status,
            400,
            JSON.stringify(invalid),
          );
        assert.equal(
          (await api('/orders', { ...booking, customerId: randomUUID() }))
            .status,
          404,
        );
        assert.equal((await api('/orders/not-a-uuid')).status, 400);
        assert.equal((await api('/orders?page=0')).status, 400);
      },
    );
    await t.test(
      'books and records an advance exactly once without charging the estimate or touching stock',
      async () => {
        const results = await Promise.all([
          api('/orders', booking),
          api('/orders', booking),
        ]);
        for (const result of results)
          assert.equal(result.status, 201, JSON.stringify(result.body));
        assert.deepEqual(results[0].body, results[1].body);
        detail = results[0].body;
        assert.equal(detail.order.orderCode, 'O-000001');
        assert.equal(detail.order.pieceCount, 2);
        assert.equal(detail.order.status, 'BOOKED');
        assert.equal(detail.events.length, 1);
        assert.equal(detail.order.lines[1].fineness, '925.000');
        assert.equal(detail.customer.balanceNpr, '-5000.25');
        assert.equal(detail.order.taggedPaymentsNpr, '5000.25');
        initialPayment = detail.payments[0];
        assert.equal(
          (await ok(`/customers/${customer.id}/ledger`, undefined, 200)).total,
          1,
        );
        assert.equal((await ok('/inventory/items', undefined, 200)).total, 0);
        assert.equal(
          (await api('/orders', { ...booking, notes: 'Changed' })).status,
          409,
        );
        await ok(
          `/customers/${customer.id}`,
          {
            name: 'Changed customer',
            expectedVersion: 1,
            reason: 'Correct contact details',
          },
          200,
          'PATCH',
        );
        assert.equal(
          (await get(detail.order.id)).order.customerSnapshot.name,
          customerInput.name,
        );
        assert.equal(
          (await ok('/orders?search=Floral', undefined, 200)).total,
          1,
        );
        assert.equal((await ok('/orders?search=%25', undefined, 200)).total, 0);
      },
    );
    await t.test(
      'additional advances are retry-safe and customer reversals retain the order link',
      async () => {
        const payment = {
          requestId: randomUUID(),
          entryDate: today,
          amountNpr: '2000.10',
          method: 'BANK',
          reference: 'Transfer',
          notes: '',
        };
        const results = await Promise.all([
          api(`/orders/${detail.order.id}/payments`, payment),
          api(`/orders/${detail.order.id}/payments`, payment),
        ]);
        assert.deepEqual(
          results.map((result) => result.status),
          [201, 201],
        );
        assert.equal(results[1].body.order.taggedPaymentsNpr, '7000.35');
        assert.equal(
          (
            await api(`/orders/${detail.order.id}/payments`, {
              ...payment,
              amountNpr: '2000.11',
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await api(`/orders/${detail.order.id}/payments`, {
              ...payment,
              requestId: randomUUID(),
              entryDate: prior,
            })
          ).status,
          400,
        );
        await ok(
          `/customers/${customer.id}/entries/${initialPayment.id}/reverse`,
          {
            requestId: randomUUID(),
            entryDate: today,
            reason: 'Erroneous initial advance',
          },
        );
        const reversed = await get(detail.order.id);
        assert.equal(reversed.order.taggedPaymentsNpr, '2000.10');
        assert.equal(reversed.customer.balanceNpr, '-2000.10');
        assert.equal(reversed.payments.length, 3);
        const ledger = await ok(
          `/customers/${customer.id}/ledger`,
          undefined,
          200,
        );
        assert.equal(
          ledger.items.find((entry) => entry.kind === 'REVERSAL').orderId,
          detail.order.id,
        );
      },
    );
    const progress = async (id, status, reason = 'Update order progress') => {
      const current = await get(id);
      return ok(`/orders/${id}/status`, {
        requestId: randomUUID(),
        expectedVersion: current.order.version,
        eventDate: today,
        status,
        reason,
      });
    };
    await t.test(
      'progress changes are versioned, preserve rework history and reject stale concurrent edits',
      async () => {
        const update = {
          requestId: randomUUID(),
          expectedVersion: 1,
          eventDate: today,
          status: 'IN_PROGRESS',
          reason: 'Start crafting the pieces',
        };
        const results = await Promise.all([
          api(`/orders/${detail.order.id}/status`, update),
          api(`/orders/${detail.order.id}/status`, update),
        ]);
        assert.deepEqual(
          results.map((result) => result.status),
          [201, 201],
        );
        assert.equal(
          (
            await api(`/orders/${detail.order.id}/status`, {
              ...update,
              requestId: randomUUID(),
              status: 'READY',
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await api(`/orders/${detail.order.id}/status`, {
              ...update,
              status: 'READY',
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await api(`/orders/${detail.order.id}/status`, {
              ...update,
              status: 'DELIVERED',
            })
          ).status,
          400,
        );
        detail = await progress(detail.order.id, 'READY');
        detail = await progress(
          detail.order.id,
          'IN_PROGRESS',
          'Polish again before delivery',
        );
        detail = await progress(detail.order.id, 'READY');
        assert.equal(detail.order.version, 5);
        assert.equal(detail.events.length, 5);
        assert.equal(detail.events[3].reason, 'Polish again before delivery');
        assert.deepEqual(await ok('/orders/summary', undefined, 200), {
          active: 1,
          ready: 1,
          overdue: 0,
        });
      },
    );
    let gold, alternateGold, silver, goldRate, silverRate;
    async function saleInput(goldPiece = gold) {
      return {
        customerId: customer.id,
        orderId: detail.order.id,
        saleDate: today,
        lines: [
          {
            itemId: goldPiece.id,
            rateId: goldRate.id,
            wastageGrams: '0',
            makingNpr: '0',
            stonesNpr: '0',
          },
          {
            itemId: silver.id,
            rateId: silverRate.id,
            wastageGrams: '0',
            makingNpr: '0',
            stonesNpr: '0',
          },
        ],
        discountNpr: '0',
        taxNpr: '0',
        paymentNpr: '100000',
        paymentMethod: 'CASH',
        paymentReference: 'Delivery payment',
        billReference: 'MANUAL-TEST',
        notes: '',
      };
    }
    async function reviewed(draft) {
      const quote = await ok('/sales/preview', draft);
      return {
        ...draft,
        requestId: randomUUID(),
        expectedTotalNpr: quote.totalNpr,
        expectedBalanceNpr: quote.balanceBeforeNpr,
        expectedCustomerVersion: quote.customer.version,
        expectedOrderVersion: quote.order?.version ?? null,
      };
    }
    await t.test(
      'delivery requires the right customer, complete quantities, purity and current ready version',
      async () => {
        const rate = {
          rateDate: today,
          metal: 'GOLD',
          fineness: '916.667',
          buyRatePerTola: '150000',
          sellRatePerTola: '150000',
          source: 'Test rate',
          reason: '',
          expectedRevision: 0,
        };
        goldRate = await ok('/rates', rate);
        silverRate = await ok('/rates', {
          ...rate,
          metal: 'SILVER',
          fineness: '925',
          buyRatePerTola: '1800',
          sellRatePerTola: '1800',
        });
        const item = {
          itemCode: 'ORDER-GOLD',
          name: 'Finished gold ring',
          category: 'Ring',
          metal: 'GOLD',
          fineness: '916.667',
          grossWeightGrams: '12.664',
          nonMetalWeightGrams: '1',
          notes: 'Test finished piece',
        };
        gold = await ok('/inventory/items', item);
        alternateGold = await ok('/inventory/items', {
          ...item,
          itemCode: 'ORDER-GOLD-ALT',
        });
        silver = await ok('/inventory/items', {
          ...item,
          itemCode: 'ORDER-SILVER',
          name: 'Finished bracelet',
          metal: 'SILVER',
          fineness: '925',
        });
        const draft = await saleInput();
        assert.equal(
          (
            await api('/sales/preview', {
              ...draft,
              customerId: otherCustomer.id,
            })
          ).status,
          409,
        );
        assert.equal(
          (await api('/sales/preview', { ...draft, lines: [draft.lines[0]] }))
            .status,
          409,
        );
        assert.equal(
          (
            await api('/sales/preview', {
              ...draft,
              lines: [
                draft.lines[0],
                { ...draft.lines[0], itemId: alternateGold.id },
              ],
            })
          ).status,
          409,
        );
        const stale = await reviewed(draft);
        await progress(
          detail.order.id,
          'IN_PROGRESS',
          'Final polishing adjustment',
        );
        assert.equal((await api('/sales', stale)).status, 409);
        await progress(detail.order.id, 'READY');
        assert.equal((await api('/sales', stale)).status, 409);
      },
    );
    await t.test(
      'failed delivery rolls back stock, charges and order state; competing deliveries post once',
      async () => {
        const input = await reviewed(await saleInput());
        await db.query(
          `CREATE FUNCTION fail_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='SALE_DELIVERED' THEN RAISE EXCEPTION 'Test delivery failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_test BEFORE INSERT ON custom_order_events FOR EACH ROW EXECUTE FUNCTION fail_delivery()`,
        );
        try {
          assert.equal((await api('/sales', input)).status, 503);
          assert.equal((await get(detail.order.id)).order.status, 'READY');
          assert.equal((await ok('/sales', undefined, 200)).total, 0);
          assert.equal(
            (await ok('/inventory/items?status=AVAILABLE', undefined, 200))
              .total,
            3,
          );
          assert.equal(
            (await get(detail.order.id)).customer.balanceNpr,
            '-2000.10',
          );
        } finally {
          await db.query(
            'DROP TRIGGER fail_test ON custom_order_events; DROP FUNCTION fail_delivery()',
          );
        }
        const inputs = [input, await reviewed(await saleInput(alternateGold))];
        const results = await Promise.all(
          inputs.map((input) => api('/sales', input)),
        );
        assert.deepEqual(
          results.map((result) => result.status).sort(),
          [201, 409],
        );
        const winner = results.findIndex((result) => result.status === 201);
        delivery = results[winner].body;
        assert.deepEqual(await ok('/sales', inputs[winner]), delivery);
        const delivered = await get(detail.order.id);
        assert.equal(delivered.order.status, 'DELIVERED');
        assert.equal(delivered.order.activeSaleId, delivery.sale.id);
        assert.equal(delivery.sale.orderId, detail.order.id);
        assert.equal(delivery.sale.totalNpr, '151800.00');
        assert.equal(delivery.sale.advanceAppliedNpr, '2000.10');
        assert.equal(delivery.sale.balanceAfterNpr, '49799.90');
        assert.equal(delivered.customer.balanceNpr, '49799.90');
        assert.equal(delivered.order.taggedPaymentsNpr, '2000.10');
        assert.equal(delivered.events.at(-1).saleId, delivery.sale.id);
        assert.equal(
          (await ok('/inventory/items?status=SOLD', undefined, 200)).total,
          2,
        );
        assert.equal(
          (
            await api(`/orders/${detail.order.id}/payments`, {
              requestId: randomUUID(),
              entryDate: today,
              amountNpr: '1',
              method: 'CASH',
              reference: '',
              notes: '',
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await api(`/orders/${detail.order.id}/status`, {
              requestId: randomUUID(),
              expectedVersion: delivered.order.version,
              eventDate: today,
              status: 'CANCELLED',
              reason: 'Cancel delivered order',
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      'correcting a delivery reopens the order, restores stock and reverses accounts atomically',
      async () => {
        const correction = {
          requestId: randomUUID(),
          cancellationDate: today,
          reason: 'Erroneous delivery; pieces remain in shop',
          confirmStockInShop: true,
        };
        await db.query(
          `CREATE FUNCTION fail_reopen() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='SALE_REOPENED' THEN RAISE EXCEPTION 'Test reopen failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_test BEFORE INSERT ON custom_order_events FOR EACH ROW EXECUTE FUNCTION fail_reopen()`,
        );
        try {
          assert.equal(
            (await api(`/sales/${delivery.sale.id}/cancel`, correction)).status,
            503,
          );
          assert.equal((await get(detail.order.id)).order.status, 'DELIVERED');
          assert.equal(
            (await ok('/inventory/items?status=SOLD', undefined, 200)).total,
            2,
          );
          assert.equal(
            (await get(detail.order.id)).customer.balanceNpr,
            '49799.90',
          );
        } finally {
          await db.query(
            'DROP TRIGGER fail_test ON custom_order_events; DROP FUNCTION fail_reopen()',
          );
        }
        await ok(`/sales/${delivery.sale.id}/cancel`, correction);
        await ok(`/sales/${delivery.sale.id}/cancel`, correction);
        detail = await get(detail.order.id);
        assert.equal(detail.order.status, 'READY');
        assert.equal(detail.order.activeSaleId, null);
        assert.equal(detail.events.at(-1).kind, 'SALE_REOPENED');
        assert.equal(detail.customer.balanceNpr, '-2000.10');
        assert.equal(
          (await ok('/inventory/items?status=AVAILABLE', undefined, 200)).total,
          3,
        );
        const redelivered = await ok(
          '/sales',
          await reviewed(await saleInput()),
        );
        assert.equal(
          (await get(detail.order.id)).order.activeSaleId,
          redelivered.sale.id,
        );
      },
    );
    await t.test(
      'cancelled orders retain advances, support explicit refunds and cannot be reopened or delivered',
      async () => {
        const created = await ok('/orders', {
          ...booking,
          requestId: randomUUID(),
          customerId: otherCustomer.id,
          lines: [spec],
          deposit: {
            amountNpr: '100',
            method: 'CASH',
            reference: 'Cancel test',
          },
        });
        const cancelled = await progress(
          created.order.id,
          'CANCELLED',
          'Customer cancelled before production',
        );
        assert.equal(cancelled.customer.balanceNpr, '-100.00');
        assert.equal(cancelled.order.taggedPaymentsNpr, '100.00');
        assert.equal(
          (
            await api(`/orders/${created.order.id}/status`, {
              requestId: randomUUID(),
              expectedVersion: 2,
              eventDate: today,
              status: 'READY',
              reason: 'Attempt reopening',
            })
          ).status,
          409,
        );
        await ok(`/customers/${otherCustomer.id}/payments`, {
          requestId: randomUUID(),
          kind: 'ADVANCE_REFUND',
          entryDate: today,
          amountNpr: '100',
          method: 'CASH',
          reference: 'Actual refund',
          notes: '',
        });
        assert.equal((await get(created.order.id)).customer.balanceNpr, '0.00');
        assert.equal(
          (await get(created.order.id)).order.taggedPaymentsNpr,
          '100.00',
        );
      },
    );
    await t.test(
      'late creation/payment failures roll back order records, entries and counters',
      async () => {
        const before = (
          await db.query(
            'SELECT scope,last_number::text FROM shop_counters ORDER BY scope',
          )
        ).rows;
        await db.query(
          `CREATE FUNCTION fail_advance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.order_id IS NOT NULL THEN RAISE EXCEPTION 'Test advance failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_test BEFORE INSERT ON customer_account_entries FOR EACH ROW EXECUTE FUNCTION fail_advance()`,
        );
        try {
          assert.equal(
            (
              await api('/orders', {
                ...booking,
                requestId: randomUUID(),
                notes: 'FAIL_ORDER',
              })
            ).status,
            503,
          );
          assert.equal(
            (await ok('/orders?search=FAIL_ORDER&status=ALL', undefined, 200))
              .total,
            0,
          );
          assert.deepEqual(
            (
              await db.query(
                'SELECT scope,last_number::text FROM shop_counters ORDER BY scope',
              )
            ).rows,
            before,
          );
        } finally {
          await db.query(
            'DROP TRIGGER fail_test ON customer_account_entries; DROP FUNCTION fail_advance()',
          );
        }
      },
    );
    await t.test(
      'overdue filtering, pagination, append-only history and shop isolation survive restart',
      async () => {
        const overdue = await ok('/orders', {
          ...booking,
          requestId: randomUUID(),
          orderDate: prior,
          dueDate: prior,
          deposit: { amountNpr: '0', method: null, reference: '' },
        });
        assert.equal(overdue.order.overdue, true);
        assert.equal(
          (await ok('/orders?overdue=true', undefined, 200)).total,
          1,
        );
        assert.equal(
          (await ok('/orders?page=999&pageSize=1&status=ALL', undefined, 200))
            .total,
          3,
        );
        assert.equal((await ok('/orders/summary', undefined, 200)).overdue, 1);
        for (const table of ['custom_orders', 'custom_order_events'])
          await assert.rejects(
            db.query(
              `DELETE FROM ${table} WHERE ${table === 'custom_orders' ? 'id' : 'order_id'}=$1`,
              [detail.order.id],
            ),
            /append-only/,
          );
        await assert.rejects(
          db.query('UPDATE custom_orders SET notes=$1 WHERE id=$2', [
            'Erase',
            detail.order.id,
          ]),
          /append-only/,
        );
        const foreignShop = randomUUID(),
          foreignCustomer = randomUUID(),
          foreignOrder = randomUUID();
        await db.query('INSERT INTO shops(id,name) VALUES($1,$2)', [
          foreignShop,
          'Other tenant',
        ]);
        await db.query(
          `INSERT INTO customers(id,shop_id,customer_code,name,opened_on,create_request_id,request_fingerprint) VALUES($1,$2,'PRIVATE','Private customer',$3,$4,$5)`,
          [foreignCustomer, foreignShop, today, randomUUID(), '0'.repeat(64)],
        );
        await db.query(
          `INSERT INTO custom_orders(id,shop_id,customer_id,order_code,order_date,due_date,customer_snapshot,lines,piece_count,request_id,request_fingerprint) VALUES($1,$2,$3,'PRIVATE',$4,$4,'{}',$5,1,$6,$7)`,
          [
            foreignOrder,
            foreignShop,
            foreignCustomer,
            today,
            JSON.stringify([spec]),
            randomUUID(),
            '0'.repeat(64),
          ],
        );
        for (const path of [`/orders/${foreignOrder}`])
          assert.equal((await api(path)).status, 404);
        assert.equal(
          (
            await api('/orders', {
              ...booking,
              requestId: randomUUID(),
              customerId: foreignCustomer,
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await api(`/orders/${foreignOrder}/payments`, {
              requestId: randomUUID(),
              entryDate: today,
              amountNpr: '1',
              method: 'CASH',
            })
          ).status,
          404,
        );
        assert.equal(
          (await ok('/orders?search=PRIVATE&status=ALL', undefined, 200)).total,
          0,
        );
        const snapshot = await get(detail.order.id);
        await app.close();
        await start();
        assert.deepEqual(await get(detail.order.id), snapshot);
      },
    );
    await t.test(
      'pre-order-support sale request fingerprints still replay after the upgrade',
      async () => {
        const legacyDraft = await saleInput(alternateGold);
        delete legacyDraft.orderId;
        legacyDraft.lines = [legacyDraft.lines[0]];
        legacyDraft.paymentNpr = '0';
        legacyDraft.paymentMethod = null;
        // The successful delivery above may have used either gold piece; find a fresh available piece.
        const fresh = await ok('/inventory/items', {
          itemCode: 'LEGACY-SALE',
          name: 'Legacy piece',
          category: 'Ring',
          metal: 'GOLD',
          fineness: '916.667',
          grossWeightGrams: '11.664',
          nonMetalWeightGrams: '0',
          notes: '',
        });
        legacyDraft.lines[0].itemId = fresh.id;
        const quoted = await ok('/sales/preview', legacyDraft);
        const legacy = {
          ...legacyDraft,
          requestId: randomUUID(),
          expectedTotalNpr: quoted.totalNpr,
          expectedCustomerVersion: quoted.customer.version,
          expectedBalanceNpr: quoted.balanceBeforeNpr,
        };
        const saved = await ok('/sales', legacy);
        const fingerprint = (
          await db.query('SELECT request_fingerprint FROM sales WHERE id=$1', [
            saved.sale.id,
          ])
        ).rows[0].request_fingerprint;
        assert.equal(
          fingerprint,
          createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
        );
        assert.equal((await ok('/sales', legacy)).sale.id, saved.sale.id);
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
