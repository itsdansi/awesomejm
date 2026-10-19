import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';

test('customer accounts keep exact, retry-safe balances and immutable history', async (t) => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm';
  const admin = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
  });
  const schema = `customers_test_${randomUUID().replaceAll('-', '')}`;
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
    async function api(path = '', body, method = 'POST') {
      const response = await fetch(
        `${await app.getUrl()}/api/v1/customers${path}`,
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
    const create = {
      requestId: randomUUID(),
      name: 'परीक्षण ग्राहक',
      phone: '+977 (980) 000-0000',
      address: 'Test address',
      pan: '123456789',
      notes: 'Test only',
      openedOn: '2026-01-01',
      openingType: 'DUE',
      openingAmountNpr: '1000.10',
      openingReference: 'Paper ledger balance',
    };
    const payment = {
      requestId: randomUUID(),
      kind: 'PAYMENT',
      entryDate: '2026-01-02',
      amountNpr: '300.05',
      method: 'CASH',
      reference: 'Test payment',
      notes: '',
    };
    let customer, receipt, advanceCustomer, settledCustomer;
    const post = (body) => api(`/${customer.id}/payments`, body);

    await t.test(
      'validates identity, opening balance, precision and server-selected shop',
      async () => {
        for (const invalid of [
          { name: '' },
          { phone: '12' },
          { pan: '12345678' },
          { openingAmountNpr: '0.001' },
          { openingType: 'NONE' },
          { openingAmountNpr: '0' },
          { openingReference: '' },
          { openedOn: '2099-01-01' },
          { openedOn: '2026-02-30' },
          { shopId: randomUUID() },
        ]) {
          assert.equal(
            (await api('', { ...create, ...invalid })).status,
            400,
            JSON.stringify(invalid),
          );
        }
        assert.equal((await api('?page=0')).status, 400);
        assert.equal((await api('/not-a-uuid')).status, 400);
      },
    );
    await t.test(
      'creates the customer and opening entry exactly once under retries',
      async () => {
        const results = await Promise.all([api('', create), api('', create)]);
        assert.deepEqual(
          results.map((result) => result.status),
          [201, 201],
        );
        customer = results[0].body;
        assert.equal(customer.id, results[1].body.id);
        assert.equal(customer.customerCode, 'C-000001');
        assert.equal(customer.balanceNpr, '1000.10');
        assert.equal(customer.phone, '+9779800000000');
        assert.equal((await api(`/${customer.id}/ledger`)).body.total, 1);
        assert.equal(
          (await api('', { ...create, name: 'Different payload' })).status,
          409,
        );
        assert.equal(
          (
            await api(
              '?search=%E0%A4%97%E0%A5%8D%E0%A4%B0%E0%A4%BE%E0%A4%B9%E0%A4%95',
            )
          ).body.total,
          1,
        );
        assert.equal((await api('?search=%25')).body.total, 0);
      },
    );
    await t.test(
      'records precise partial payment and replays a saved request without double credit',
      async () => {
        const first = await post(payment);
        assert.equal(first.status, 201);
        receipt = first.body;
        assert.equal(receipt.customer.balanceNpr, '700.05');
        const repeated = await post(payment);
        assert.equal(repeated.body.entryId, receipt.entryId);
        assert.equal(repeated.body.customer.balanceNpr, '700.05');
        assert.equal(
          (await post({ ...payment, amountNpr: '300.06' })).status,
          409,
        );
        assert.equal((await api(`/${customer.id}/ledger`)).body.total, 2);
      },
    );
    await t.test(
      'treats overpayment as advance and limits refunds to advance held',
      async () => {
        assert.equal(
          (
            await post({
              ...payment,
              requestId: randomUUID(),
              kind: 'ADVANCE_REFUND',
              amountNpr: '1',
            })
          ).status,
          400,
        );
        const overpaid = await post({
          ...payment,
          requestId: randomUUID(),
          entryDate: '2026-01-03',
          amountNpr: '800.10',
        });
        assert.equal(overpaid.body.customer.balanceNpr, '-100.05');
        const refunded = await post({
          ...payment,
          requestId: randomUUID(),
          kind: 'ADVANCE_REFUND',
          entryDate: '2026-01-04',
          amountNpr: '20.02',
        });
        assert.equal(refunded.body.customer.balanceNpr, '-80.03');
        assert.equal(
          (
            await post({
              ...payment,
              requestId: randomUUID(),
              kind: 'ADVANCE_REFUND',
              entryDate: '2026-01-04',
              amountNpr: '80.04',
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      'serializes refunds and concurrent payment retries',
      async () => {
        const refund = {
          ...payment,
          kind: 'ADVANCE_REFUND',
          entryDate: '2026-01-05',
          amountNpr: '50',
        };
        const refunds = await Promise.all([
          post({ ...refund, requestId: randomUUID() }),
          post({ ...refund, requestId: randomUUID() }),
        ]);
        assert.deepEqual(
          refunds.map((result) => result.status).sort(),
          [201, 400],
        );
        const cent = {
          ...payment,
          requestId: randomUUID(),
          entryDate: '2026-01-05',
          amountNpr: '0.01',
        };
        const retries = await Promise.all([post(cent), post(cent)]);
        assert.equal(retries[0].body.entryId, retries[1].body.entryId);
        assert.equal(retries[1].body.customer.balanceNpr, '-30.04');
        await Promise.all([
          post({ ...cent, requestId: randomUUID() }),
          post({ ...cent, requestId: randomUUID() }),
        ]);
        assert.equal(
          (await api(`/${customer.id}`)).body.customer.balanceNpr,
          '-30.06',
        );
        assert.equal(
          (await post({ ...payment, requestId: randomUUID() })).status,
          400,
        );
      },
    );
    await t.test(
      'reverses exactly once and preserves original values',
      async () => {
        const reverse = {
          requestId: randomUUID(),
          entryDate: '2026-01-06',
          reason: 'Correct a mistaken payment',
        };
        const inputs = [reverse, { ...reverse, requestId: randomUUID() }];
        const results = await Promise.all(
          inputs.map((input) =>
            api(`/${customer.id}/entries/${receipt.entryId}/reverse`, input),
          ),
        );
        assert.deepEqual(
          results.map((result) => result.status).sort(),
          [201, 409],
        );
        const successIndex = results.findIndex(
          (result) => result.status === 201,
        );
        assert.equal(results[successIndex].body.customer.balanceNpr, '269.99');
        const replay = await api(
          `/${customer.id}/entries/${receipt.entryId}/reverse`,
          inputs[successIndex],
        );
        assert.equal(replay.body.entryId, results[successIndex].body.entryId);
        assert.equal(
          (
            await api(
              `/${customer.id}/entries/${replay.body.entryId}/reverse`,
              { ...reverse, requestId: randomUUID() },
            )
          ).status,
          400,
        );
        const statement = (await api(`/${customer.id}/ledger`)).body;
        const original = statement.items.find(
          (entry) => entry.id === receipt.entryId,
        );
        assert.equal(original.amountNpr, '-300.05');
        assert.equal(original.reversed, true);
        assert.equal(
          statement.items.find((entry) => entry.reversalOf === receipt.entryId)
            .amountNpr,
          '300.05',
        );
        assert.equal((await post(payment)).body.entryId, receipt.entryId);
      },
    );
    await t.test(
      'computes running and period balances before applying pagination',
      async () => {
        const period = (
          await api(`/${customer.id}/ledger?from=2026-01-02&to=2026-01-02`)
        ).body;
        assert.equal(period.total, 1);
        assert.equal(period.openingBalanceNpr, '1000.10');
        assert.equal(period.closingBalanceNpr, '700.05');
        assert.equal(period.items[0].runningBalanceNpr, '700.05');
        assert.equal(period.customer.balanceNpr, '269.99');
        const lastPage = (
          await api(`/${customer.id}/ledger?page=100&pageSize=1`)
        ).body;
        assert.equal(lastPage.total, 9);
        assert.equal(lastPage.items.length, 0);
        assert.equal(
          (await api(`/${customer.id}/ledger?from=2026-01-03&to=2026-01-01`))
            .status,
          400,
        );
      },
    );
    await t.test(
      'audits profile edits, rejects stale edits and preserves receipt snapshots',
      async () => {
        const update = {
          name: 'Updated test customer',
          phone: '9800000001',
          address: 'New test address',
          pan: '987654321',
          notes: 'Changed',
          expectedVersion: 1,
          reason: 'Correct the contact details',
        };
        assert.equal(
          (
            await api(
              `/${customer.id}`,
              { ...update, openingAmountNpr: '0' },
              'PATCH',
            )
          ).status,
          400,
        );
        const changed = await api(`/${customer.id}`, update, 'PATCH');
        assert.equal(changed.status, 200);
        assert.equal(changed.body.version, 2);
        assert.equal(
          (await api(`/${customer.id}`, update, 'PATCH')).status,
          409,
        );
        const history = (await api(`/${customer.id}`)).body.profileHistory;
        assert.equal(history.length, 2);
        assert.equal(history[1].name, create.name);
        const partial = await api(
          `/${customer.id}`,
          {
            address: 'Partial address correction',
            expectedVersion: 2,
            reason: 'Correct only the address',
          },
          'PATCH',
        );
        assert.equal(partial.status, 200);
        assert.equal(partial.body.version, 3);
        assert.equal(partial.body.name, update.name);
        assert.equal(partial.body.phone, update.phone);
        assert.equal(partial.body.pan, update.pan);
        assert.equal(partial.body.notes, update.notes);
        assert.equal(
          (
            await api(
              `/${customer.id}`,
              { expectedVersion: 3, reason: 'No fields provided' },
              'PATCH',
            )
          ).status,
          400,
        );
        const statement = (await api(`/${customer.id}/ledger`)).body;
        assert.equal(
          statement.items.find((entry) => entry.id === receipt.entryId)
            .customerSnapshot.name,
          create.name,
        );
        const newPayment = await post({
          ...payment,
          requestId: randomUUID(),
          entryDate: '2026-01-07',
          amountNpr: '0.10',
        });
        assert.equal(newPayment.body.customer.balanceNpr, '269.89');
        assert.equal((await api('', create)).body.name, update.name);
      },
    );
    await t.test(
      'keeps dues and advances separate in summary and supports balance filters',
      async () => {
        advanceCustomer = (
          await api('', {
            ...create,
            requestId: randomUUID(),
            name: 'Advance customer',
            openingType: 'ADVANCE',
            openingAmountNpr: '10.01',
          })
        ).body;
        settledCustomer = (
          await api('', {
            ...create,
            requestId: randomUUID(),
            name: 'Settled customer',
            openingType: 'NONE',
            openingAmountNpr: '0',
          })
        ).body;
        assert.equal(advanceCustomer.balanceNpr, '-10.01');
        assert.equal(settledCustomer.balanceNpr, '0.00');
        assert.equal((await api('?balance=DUE')).body.total, 1);
        assert.equal((await api('?balance=ADVANCE')).body.total, 1);
        assert.equal((await api('?balance=SETTLED')).body.total, 1);
        const summary = (await api('/summary')).body;
        assert.equal(summary.customers, 3);
        assert.equal(summary.receivableNpr, '269.89');
        assert.equal(summary.advanceNpr, '10.01');
        assert.equal(
          (await api(`/${settledCustomer.id}/payments`, payment)).status,
          409,
        );
      },
    );
    await t.test(
      'rolls back customer, profile history and numbering when opening posting fails',
      async () => {
        const before = (
          await db.query(
            "SELECT last_number::text FROM shop_counters WHERE scope='CUSTOMER'",
          )
        ).rows[0].last_number;
        await db.query(
          `CREATE FUNCTION fail_opening() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reference = 'FAIL_OPENING' THEN RAISE EXCEPTION 'Simulated failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_test BEFORE INSERT ON customer_account_entries FOR EACH ROW EXECUTE FUNCTION fail_opening()`,
        );
        try {
          assert.equal(
            (
              await api('', {
                ...create,
                requestId: randomUUID(),
                name: 'FAIL_CUSTOMER',
                openingReference: 'FAIL_OPENING',
              })
            ).status,
            503,
          );
          assert.equal((await api('?search=FAIL_CUSTOMER')).body.total, 0);
          assert.equal(
            (
              await db.query(
                "SELECT last_number::text FROM shop_counters WHERE scope='CUSTOMER'",
              )
            ).rows[0].last_number,
            before,
          );
          assert.equal(
            (
              await db.query(
                'SELECT count(*)::int AS count FROM customer_profile_history',
              )
            ).rows[0].count,
            5,
          );
        } finally {
          await db.query(
            'DROP TRIGGER fail_test ON customer_account_entries; DROP FUNCTION fail_opening()',
          );
        }
      },
    );
    await t.test(
      'isolates shops and blocks changes or deletion of posted history',
      async () => {
        const otherShop = randomUUID(),
          otherCustomer = randomUUID();
        await db.query('INSERT INTO shops(id,name) VALUES($1,$2)', [
          otherShop,
          'Other shop',
        ]);
        await db.query(
          `INSERT INTO customers(id,shop_id,customer_code,name,opened_on,create_request_id,request_fingerprint) VALUES($1,$2,'PRIVATE','Private customer','2026-01-01',$3,$4)`,
          [otherCustomer, otherShop, randomUUID(), '0'.repeat(64)],
        );
        assert.equal((await api(`/${otherCustomer}`)).status, 404);
        assert.equal((await api(`/${otherCustomer}/ledger`)).status, 404);
        assert.equal(
          (
            await api(`/${otherCustomer}/payments`, {
              ...payment,
              requestId: randomUUID(),
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await api(
              `/${settledCustomer.id}/entries/${receipt.entryId}/reverse`,
              {
                requestId: randomUUID(),
                entryDate: '2026-01-07',
                reason: 'Wrong customer access',
              },
            )
          ).status,
          404,
        );
        assert.equal((await api('?search=PRIVATE')).body.total, 0);
        assert.equal((await api('/summary')).body.customers, 3);
        await assert.rejects(
          db.query('UPDATE customer_account_entries SET notes=$1 WHERE id=$2', [
            'Erase',
            receipt.entryId,
          ]),
          /append-only/,
        );
        await assert.rejects(
          db.query('DELETE FROM customer_account_entries WHERE id=$1', [
            receipt.entryId,
          ]),
          /append-only/,
        );
        await assert.rejects(
          db.query(
            'DELETE FROM customer_profile_history WHERE customer_id=$1',
            [customer.id],
          ),
          /append-only/,
        );
      },
    );
    await t.test('persists balances after an application restart', async () => {
      await app.close();
      await start();
      assert.equal(
        (await api(`/${customer.id}`)).body.customer.balanceNpr,
        '269.89',
      );
      assert.equal((await api(`/${customer.id}/ledger`)).body.total, 10);
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
