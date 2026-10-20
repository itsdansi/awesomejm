import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { URLSearchParams } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import { nepalToday } from '@awesomejm/contracts';
import { AppModule } from '../dist/app.module.js';

test('old-metal purchases, exchanges, dashboard and dated reports stay consistent', async (t) => {
  const connectionString =
      process.env.TEST_DATABASE_URL ??
      'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm',
    admin = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 }),
    schema = `trade_test_${randomUUID().replaceAll('-', '')}`;
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
    async function ok(path, body, status = 201, method = 'POST') {
      const r = await api(path, body, method);
      assert.equal(r.status, status, `${path}: ${JSON.stringify(r.body)}`);
      return r.body;
    }
    const today = nepalToday(),
      monthStart = `${today.slice(0, 7)}-01`,
      last = new Date(`${monthStart}T12:00:00Z`);
    last.setUTCDate(0);
    const prior = last.toISOString().slice(0, 10);
    const baseCustomer = {
      requestId: randomUUID(),
      name: 'Trade customer',
      phone: '9800000000',
      address: 'Test address',
      pan: '',
      notes: '',
      openedOn: '2026-01-01',
      openingType: 'DUE',
      openingAmountNpr: '1000',
      openingReference: 'Earlier dues',
    };
    const customer = await ok('/customers', baseCustomer),
      second = await ok('/customers', {
        ...baseCustomer,
        requestId: randomUUID(),
        name: 'Second trade customer',
        openingType: 'NONE',
        openingAmountNpr: '0',
      });
    const rateInput = {
      rateDate: today,
      metal: 'GOLD',
      fineness: '916.667',
      buyRatePerTola: '116640',
      sellRatePerTola: '150000',
      source: 'Test quote',
      reason: '',
      expectedRevision: 0,
    };
    let rate = await ok('/rates', rateInput);
    const earlier = await ok('/rates', { ...rateInput, rateDate: prior });
    const incoming = {
      name: 'Old ring',
      metal: 'GOLD',
      fineness: '916.667',
      grossWeightGrams: '12.664',
      nonMetalWeightGrams: '1',
      deductedWeightGrams: '0.164',
      deductionNpr: '100',
      deductionReason: 'Agreed assessment deductions',
      assayNotes: 'Tested by shop, assay recorded',
      rateId: rate.id,
    };
    const draft = {
      customerId: customer.id,
      purchaseDate: today,
      lines: [incoming],
      payoutNpr: '0',
      payoutMethod: null,
      payoutReference: '',
      reference: 'TEST-PURCHASE',
      notes: 'Test only',
      sale: null,
    };
    const review = async (value) => {
      const q = await ok('/purchases/preview', value);
      return {
        ...value,
        requestId: randomUUID(),
        expectedPurchaseNpr: q.totalNpr,
        expectedSaleNpr: q.sale?.totalNpr ?? '0',
        expectedCustomerVersion: q.customer.version,
        expectedOrderVersion: q.sale?.order?.version ?? null,
        expectedBalanceNpr: q.balanceBeforeNpr,
      };
    };
    const cancellation = () => ({
      requestId: randomUUID(),
      cancellationDate: today,
      reason: 'Erroneous test record, all metal remains in shop',
      confirmStockInShop: true,
    });
    const report = async (from, to, groupBy = 'DAY') =>
      ok(
        `/reports?${new URLSearchParams({ from, to, groupBy })}`,
        undefined,
        200,
      );
    let past, exchange, exchangeInput, item, item2;
    await t.test(
      'validates assays, deductions, settlement direction and request-selected identities',
      async () => {
        assert.equal(
          (await ok('/purchases/preview', draft)).totalNpr,
          '114900.00',
        );
        for (const invalid of [
          { lines: [] },
          { lines: [{ ...incoming, nonMetalWeightGrams: '12.664' }] },
          { lines: [{ ...incoming, deductedWeightGrams: '11.664' }] },
          { lines: [{ ...incoming, deductionReason: '' }] },
          { lines: [{ ...incoming, assayNotes: '' }] },
          { lines: [{ ...incoming, fineness: '1001' }] },
          { lines: [{ ...incoming, deductionNpr: '115000' }] },
          { purchaseDate: '2099-01-01' },
          { payoutNpr: '114900', payoutMethod: 'CASH' },
          { payoutNpr: '1', payoutMethod: null },
          { shopId: randomUUID() },
        ])
          assert.equal(
            (await api('/purchases/preview', { ...draft, ...invalid })).status,
            400,
            JSON.stringify(invalid),
          );
        assert.equal(
          (
            await api('/purchases/preview', {
              ...draft,
              customerId: randomUUID(),
            })
          ).status,
          404,
        );
        assert.equal((await api('/purchases/not-a-uuid')).status, 400);
        assert.equal(
          (await api('/reports?from=2026-02-01&to=2026-01-01')).status,
          400,
        );
        assert.equal(
          (await api(`/reports?from=2000-01-01&to=${today}`)).status,
          400,
        );
      },
    );
    await t.test(
      'a historical cash purchase credits earlier dues and keeps full physical net grams',
      async () => {
        const value = {
          ...draft,
          purchaseDate: prior,
          lines: [{ ...incoming, rateId: earlier.id }],
          payoutNpr: '50000',
          payoutMethod: 'CASH',
        };
        const input = await review(value);
        const attempts = await Promise.all([
          api('/purchases', input),
          api('/purchases', input),
        ]);
        assert.deepEqual(
          attempts.map((r) => r.status),
          [201, 201],
        );
        assert.deepEqual(attempts[0].body, attempts[1].body);
        past = attempts[0].body;
        assert.equal(past.purchase.purchaseCode, 'P-000001');
        assert.equal(past.purchase.balanceAfterNpr, '-63900.00');
        assert.equal(past.lines[0].netWeightGrams, '11.664');
        assert.equal(past.lines[0].payableWeightGrams, '11.500');
        assert.equal(past.lines[0].lotCode, 'P-000001/01');
        assert.equal(
          (await api('/purchases', { ...input, notes: 'Changed' })).status,
          409,
        );
        assert.equal((await ok('/inventory/items', undefined, 200)).total, 0);
        const ledger = await ok(
          `/customers/${customer.id}/ledger`,
          undefined,
          200,
        );
        assert.equal(ledger.customer.balanceNpr, '-63900.00');
        const linked = ledger.items.filter(
          (e) => e.purchaseId === past.purchase.id,
        );
        assert.equal(linked.length, 2);
        for (const entry of linked)
          assert.equal(
            (
              await api(
                `/customers/${customer.id}/entries/${entry.id}/reverse`,
                {
                  requestId: randomUUID(),
                  entryDate: today,
                  reason: 'Independent reversal attempted',
                },
              )
            ).status,
            409,
          );
        const r = await report(prior, prior);
        assert.equal(r.totals.netPurchasesNpr, '114900.00');
        assert.equal(r.totals.paidNpr, '50000.00');
        assert.equal(r.accounts.advancesNpr, '63900.00');
        assert.equal(r.stock[0].closingGrams, '11.664');
        assert.equal(r.stock[0].closingFineGrams, '10.692004');
      },
    );
    await t.test(
      'corrections affect their effective date without rewriting previous monthly reports',
      async () => {
        const correction = cancellation();
        await ok(`/purchases/${past.purchase.id}/cancel`, correction);
        await ok(`/purchases/${past.purchase.id}/cancel`, correction);
        const old = await report(prior, prior);
        assert.equal(old.totals.netPurchasesNpr, '114900.00');
        assert.equal(old.accounts.advancesNpr, '63900.00');
        assert.equal(old.stock[0].closingGrams, '11.664');
        const now = await report(today, today);
        assert.equal(now.totals.netPurchasesNpr, '-114900.00');
        assert.equal(now.totals.paidNpr, '-50000.00');
        assert.equal(now.totals.netCashNpr, '50000.00');
        assert.equal(now.accounts.duesNpr, '1000.00');
        assert.equal(now.stock[0].openingGrams, '11.664');
        assert.equal(now.stock[0].correctionGrams, '-11.664');
        assert.equal(now.stock[0].closingGrams, '0.000');
        const monthly = await report(prior, today, 'MONTH');
        assert.equal(monthly.series.length, 2);
        assert.equal(monthly.series[0].netPurchasesNpr, '114900.00');
        assert.equal(monthly.series[1].netPurchasesNpr, '-114900.00');
        assert.equal(monthly.totals.netPurchasesNpr, '0.00');
      },
    );
    await t.test(
      'stale rates, totals and customer balances cannot post a changed valuation',
      async () => {
        const input = await review(draft);
        for (const fields of [
          { expectedPurchaseNpr: '1' },
          { expectedSaleNpr: '1' },
          { expectedCustomerVersion: 2 },
          { expectedBalanceNpr: '0' },
        ])
          assert.equal(
            (await api('/purchases', { ...input, ...fields })).status,
            409,
          );
        rate = await ok('/rates', {
          ...rateInput,
          expectedRevision: 1,
          reason: 'Revise test buying quote',
        });
        assert.equal((await api('/purchases', input)).status, 409);
        incoming.rateId = rate.id;
        assert.equal(
          (
            await api('/purchases/preview', {
              ...draft,
              lines: [{ ...incoming, rateId: earlier.id }],
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      'an exchange posts incoming lots, sale and received payment once in one transaction',
      async () => {
        const piece = {
          itemCode: 'EX-GOLD-1',
          name: 'New ring',
          category: 'Ring',
          metal: 'GOLD',
          fineness: '916.667',
          grossWeightGrams: '11.664',
          nonMetalWeightGrams: '0',
          notes: 'Test ready piece',
        };
        item = await ok('/inventory/items', piece);
        item2 = await ok('/inventory/items', {
          ...piece,
          itemCode: 'EX-GOLD-2',
        });
        const sale = {
          customerId: customer.id,
          orderId: null,
          saleDate: today,
          lines: [
            {
              itemId: item.id,
              rateId: rate.id,
              wastageGrams: '0',
              makingNpr: '0',
              stonesNpr: '0',
            },
          ],
          discountNpr: '0',
          taxNpr: '0',
          paymentNpr: '20000',
          paymentMethod: 'BANK',
          paymentReference: 'Exchange received',
          billReference: 'MANUAL-EX-1',
          notes: '',
        };
        exchangeInput = await review({ ...draft, sale });
        assert.equal(
          (
            await api('/purchases/preview', {
              ...draft,
              sale: { ...sale, customerId: second.id },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await api('/purchases/preview', {
              ...draft,
              sale,
              payoutNpr: '1',
              payoutMethod: 'CASH',
            })
          ).status,
          400,
        );
        const attempts = await Promise.all([
          api('/purchases', exchangeInput),
          api('/purchases', exchangeInput),
        ]);
        assert.deepEqual(
          attempts.map((r) => r.status),
          [201, 201],
        );
        exchange = attempts[0].body;
        assert.deepEqual(exchange, attempts[1].body);
        assert.equal(exchange.purchase.balanceBeforeNpr, '1000.00');
        assert.equal(exchange.purchase.balanceAfterNpr, '16100.00');
        assert.equal(exchange.sale.sale.totalNpr, '150000.00');
        assert.equal(exchange.sale.sale.balanceBeforeNpr, '-113900.00');
        assert.equal(exchange.sale.sale.advanceAppliedNpr, '113900.00');
        assert.equal(exchange.sale.sale.purchaseId, exchange.purchase.id);
        assert.equal(
          (await ok(`/customers/${customer.id}`, undefined, 200)).customer
            .balanceNpr,
          '16100.00',
        );
        assert.equal(
          (await ok('/inventory/items?status=SOLD', undefined, 200)).total,
          1,
        );
        assert.equal(
          (await api(`/sales/${exchange.sale.sale.id}/cancel`, cancellation()))
            .status,
          409,
        );
        const r = await report(today, today);
        assert.equal(r.totals.netSalesNpr, '150000.00');
        assert.equal(r.totals.netPurchasesNpr, '0.00');
        assert.equal(r.totals.receivedNpr, '20000.00');
        assert.equal(
          r.methods.find((m) => m.method === 'BANK').receivedNpr,
          '20000.00',
        );
      },
    );
    await t.test(
      'failed exchange posting rolls back incoming metal, sale, accounts and counters',
      async () => {
        const sale = {
          ...exchangeInput.sale,
          customerId: second.id,
          lines: [{ ...exchangeInput.sale.lines[0], itemId: item2.id }],
        };
        const input = await review({ ...draft, customerId: second.id, sale });
        const before = (
          await db.query(
            'SELECT scope,last_number::text FROM shop_counters ORDER BY scope',
          )
        ).rows;
        const count = (
          await db.query('SELECT count(*)::int AS n FROM metal_purchases')
        ).rows[0].n;
        await db.query(
          `CREATE FUNCTION fail_trade() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='PAYMENT' AND NEW.sale_id IS NOT NULL THEN RAISE EXCEPTION 'Test late exchange failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_test BEFORE INSERT ON customer_account_entries FOR EACH ROW EXECUTE FUNCTION fail_trade()`,
        );
        try {
          assert.equal((await api('/purchases', input)).status, 503);
          assert.equal(
            (await db.query('SELECT count(*)::int AS n FROM metal_purchases'))
              .rows[0].n,
            count,
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
            (await ok('/inventory/items?status=AVAILABLE', undefined, 200))
              .total,
            1,
          );
          assert.equal(
            (await ok(`/customers/${second.id}`, undefined, 200)).customer
              .balanceNpr,
            '0.00',
          );
        } finally {
          await db.query(
            'DROP TRIGGER fail_test ON customer_account_entries; DROP FUNCTION fail_trade()',
          );
        }
      },
    );
    await t.test(
      'full exchange corrections restore outgoing stock and remove incoming lots atomically',
      async () => {
        const input = cancellation();
        await db.query(
          `CREATE FUNCTION fail_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='PURCHASE_CANCEL' THEN RAISE EXCEPTION 'Test late correction failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_test BEFORE INSERT ON old_metal_movements FOR EACH ROW EXECUTE FUNCTION fail_cancel()`,
        );
        try {
          assert.equal(
            (await api(`/purchases/${exchange.purchase.id}/cancel`, input))
              .status,
            503,
          );
          assert.equal(
            (await ok(`/purchases/${exchange.purchase.id}`, undefined, 200))
              .sale.sale.status,
            'POSTED',
          );
          assert.equal(
            (await ok(`/customers/${customer.id}`, undefined, 200)).customer
              .balanceNpr,
            '16100.00',
          );
          assert.equal(
            (await ok('/inventory/items?status=SOLD', undefined, 200)).total,
            1,
          );
        } finally {
          await db.query(
            'DROP TRIGGER fail_test ON old_metal_movements; DROP FUNCTION fail_cancel()',
          );
        }
        const corrected = await ok(
          `/purchases/${exchange.purchase.id}/cancel`,
          input,
        );
        assert.equal(corrected.purchase.status, 'CANCELLED');
        assert.equal(corrected.sale.sale.status, 'CANCELLED');
        assert.equal(
          (await ok(`/customers/${customer.id}`, undefined, 200)).customer
            .balanceNpr,
          '1000.00',
        );
        assert.equal(
          (await ok('/inventory/items?status=AVAILABLE', undefined, 200)).total,
          2,
        );
        assert.equal(
          (
            await api(`/purchases/${exchange.purchase.id}/cancel`, {
              ...input,
              requestId: randomUUID(),
            })
          ).status,
          409,
        );
        assert.equal(
          (await ok('/purchases', exchangeInput)).purchase.status,
          'CANCELLED',
        );
      },
    );
    await t.test(
      'larger trade-ins can pay out their remaining balance and competing sales cannot reuse a piece',
      async () => {
        const incomingLarge = {
          ...incoming,
          grossWeightGrams: '23.328',
          nonMetalWeightGrams: '0',
          deductedWeightGrams: '0',
          deductionNpr: '0',
        };
        const sale = {
          ...exchangeInput.sale,
          customerId: second.id,
          paymentNpr: '0',
          paymentMethod: null,
        };
        const value = {
          ...draft,
          customerId: second.id,
          lines: [incomingLarge],
          payoutNpr: '50000',
          payoutMethod: 'CASH',
          sale,
        };
        assert.equal(
          (await api('/purchases/preview', { ...value, payoutNpr: '83280.01' }))
            .status,
          400,
        );
        const inputs = [
          await review(value),
          await review({ ...value, reference: 'Competing trade' }),
        ];
        const results = await Promise.all(
          inputs.map((input) => api('/purchases', input)),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        const posted = results.find((r) => r.status === 201).body;
        assert.equal(posted.purchase.balanceAfterNpr, '-33280.00');
        assert.equal(posted.purchase.totalNpr, '233280.00');
        assert.equal(posted.sale.sale.balanceAfterNpr, '-83280.00');
        assert.equal(
          (await ok(`/customers/${second.id}`, undefined, 200)).customer
            .balanceNpr,
          '-33280.00',
        );
      },
    );
    await t.test(
      'dashboard and reports share counts, balances, zero periods and exact stock reconciliation',
      async () => {
        const r = await report(today, today),
          dashboard = await ok('/dashboard', undefined, 200);
        assert.equal(dashboard.today.netSalesNpr, r.totals.netSalesNpr);
        assert.equal(dashboard.today.netPurchasesNpr, r.totals.netPurchasesNpr);
        assert.equal(dashboard.today.netCashNpr, r.totals.netCashNpr);
        assert.deepEqual(dashboard.accounts, r.accounts);
        assert.equal(dashboard.date, today);
        assert.equal(dashboard.recent.length, 5);
        assert.equal(r.totals.netSalesNpr, '150000.00');
        assert.equal(r.totals.netPurchasesNpr, '118380.00');
        assert.equal(r.totals.receivedNpr, '0.00');
        assert.equal(r.totals.paidNpr, '0.00');
        assert.equal(r.totals.netCashNpr, '0.00');
        assert.equal(r.accounts.duesNpr, '1000.00');
        assert.equal(r.accounts.advancesNpr, '33280.00');
        for (const row of r.stock) {
          const milli = (v) => BigInt(v.replace('.', ''));
          assert.equal(
            milli(row.openingGrams) +
              milli(row.receivedGrams) -
              milli(row.issuedGrams) +
              milli(row.correctionGrams),
            milli(row.closingGrams),
          );
        }
        assert.equal(
          r.stock.find((row) => row.stockClass === 'JEWELLERY').closingGrams,
          '11.664',
        );
        assert.equal(
          r.stock.find((row) => row.stockClass === 'OLD_METAL').closingGrams,
          '23.328',
        );
        const empty = await report('2026-02-01', '2026-02-03');
        assert.equal(empty.series.length, 3);
        assert.equal(empty.totals.netSalesNpr, '0.00');
        assert.equal(empty.stock.length, 0);
        assert.equal(
          (await ok('/purchases?status=CANCELLED', undefined, 200)).total,
          2,
        );
        assert.equal(
          (await ok('/purchases?page=99&pageSize=1', undefined, 200)).total,
          3,
        );
      },
    );
    await t.test(
      'ordinary sales and exchanges use consistent counter locks under concurrency',
      async () => {
        const a = await ok('/customers', {
            ...baseCustomer,
            requestId: randomUUID(),
            name: 'Counter test A',
            openingType: 'NONE',
            openingAmountNpr: '0',
          }),
          b = await ok('/customers', {
            ...baseCustomer,
            requestId: randomUUID(),
            name: 'Counter test B',
            openingType: 'NONE',
            openingAmountNpr: '0',
          });
        const piece = {
          itemCode: 'COUNTER-A',
          name: 'Counter test piece',
          category: 'Ring',
          metal: 'GOLD',
          fineness: '916.667',
          grossWeightGrams: '11.664',
          nonMetalWeightGrams: '0',
          notes: '',
        };
        const one = await ok('/inventory/items', piece),
          two = await ok('/inventory/items', {
            ...piece,
            itemCode: 'COUNTER-B',
            metal: 'SILVER',
            fineness: '925',
          });
        const outgoing = {
          ...exchangeInput.sale,
          customerId: a.id,
          lines: [{ ...exchangeInput.sale.lines[0], itemId: one.id }],
          notes: 'GATE_SALE',
        };
        const q = await ok('/sales/preview', outgoing),
          ordinary = {
            ...outgoing,
            requestId: randomUUID(),
            expectedTotalNpr: q.totalNpr,
            expectedCustomerVersion: q.customer.version,
            expectedBalanceNpr: q.balanceBeforeNpr,
            expectedOrderVersion: null,
          };
        const silverRate = await ok('/rates', {
          ...rateInput,
          metal: 'SILVER',
          fineness: '925',
          buyRatePerTola: '1500',
          sellRatePerTola: '1800',
        });
        const exchange = await review({
          ...draft,
          customerId: b.id,
          lines: [
            {
              ...incoming,
              metal: 'SILVER',
              fineness: '925',
              rateId: silverRate.id,
              deductedWeightGrams: '0',
              deductionNpr: '0',
            },
          ],
          sale: {
            ...outgoing,
            customerId: b.id,
            lines: [
              { ...outgoing.lines[0], itemId: two.id, rateId: silverRate.id },
            ],
            paymentNpr: '200',
            notes: '',
          },
        });
        await db.query(
          `CREATE FUNCTION gate_sale() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.notes='GATE_SALE' THEN PERFORM pg_advisory_xact_lock(76232145); END IF; RETURN NEW; END; $$; CREATE TRIGGER gate_test BEFORE INSERT ON sales FOR EACH ROW EXECUTE FUNCTION gate_sale()`,
        );
        const gate = await db.connect();
        let salePromise, tradePromise, lockFailure;
        async function waitFor(sql) {
          for (let attempt = 0; attempt < 200; attempt++) {
            if ((await db.query(sql)).rows[0].ready) return;
            await delay(10);
          }
          throw new Error('Expected lock wait did not occur.');
        }
        try {
          await gate.query('BEGIN');
          await gate.query('SELECT pg_advisory_xact_lock(76232145)');
          salePromise = api('/sales', ordinary);
          await waitFor(
            "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=76232145 AND NOT granted) AS ready",
          );
          tradePromise = api('/purchases', exchange);
          await waitFor(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE query LIKE '%INSERT INTO shop_counters%' AND wait_event_type='Lock') AS ready",
          );
        } catch (error) {
          lockFailure = error;
        } finally {
          await gate.query('ROLLBACK');
          gate.release();
        }
        try {
          const results = await Promise.all([salePromise, tradePromise]);
          if (lockFailure) throw lockFailure;
          assert.deepEqual(
            results.map((r) => r.status),
            [201, 201],
            JSON.stringify(results),
          );
        } finally {
          await db.query(
            'DROP TRIGGER gate_test ON sales; DROP FUNCTION gate_sale()',
          );
        }
      },
    );
    await t.test(
      'immutable histories and tenant-scoped reads survive restart',
      async () => {
        for (const table of [
          'metal_purchases',
          'old_metal_lots',
          'old_metal_movements',
          'purchase_cancellations',
        ])
          await assert.rejects(
            db.query(
              `DELETE FROM ${table} WHERE ${table === 'metal_purchases' ? 'id' : 'purchase_id'}=$1`,
              [past.purchase.id],
            ),
            /append-only/,
          );
        assert.equal((await api(`/purchases/${randomUUID()}`)).status, 404);
        const foreignShop = randomUUID(),
          foreignCustomer = randomUUID(),
          foreignPurchase = randomUUID();
        await db.query('INSERT INTO shops(id,name) VALUES($1,$2)', [
          foreignShop,
          'Other tenant',
        ]);
        await db.query(
          `INSERT INTO customers(id,shop_id,customer_code,name,opened_on,create_request_id,request_fingerprint) VALUES($1,$2,'PRIVATE','Private customer',$3,$4,$5)`,
          [foreignCustomer, foreignShop, today, randomUUID(), '0'.repeat(64)],
        );
        await db.query(
          `INSERT INTO metal_purchases(id,shop_id,customer_id,purchase_code,purchase_date,customer_snapshot,total_npr,payout_npr,payout_reference,reference,notes,balance_before_npr,balance_after_npr,request_id,request_fingerprint) VALUES($1,$2,$3,'PRIVATE',$4,'{}',999,0,'','','',0,-999,$5,$6)`,
          [
            foreignPurchase,
            foreignShop,
            foreignCustomer,
            today,
            randomUUID(),
            '0'.repeat(64),
          ],
        );
        assert.equal((await api(`/purchases/${foreignPurchase}`)).status, 404);
        assert.equal(
          (await api(`/purchases/${foreignPurchase}/cancel`, cancellation()))
            .status,
          404,
        );
        assert.equal(
          (
            await api('/purchases/preview', {
              ...draft,
              customerId: foreignCustomer,
            })
          ).status,
          404,
        );
        assert.equal(
          (await ok('/purchases?search=PRIVATE', undefined, 200)).total,
          0,
        );
        const before = await report(today, today);
        await app.close();
        await start();
        assert.deepEqual(await report(today, today), before);
        assert.equal(
          (await ok(`/purchases/${exchange.purchase.id}`, undefined, 200))
            .purchase.status,
          'CANCELLED',
        );
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
