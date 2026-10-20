import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { hashPassword, verifyPassword } from '../dist/auth/password.js';
import { AuthService, digest, csrfToken } from '../dist/auth/auth.service.js';
import { validateAccessConfig } from '../dist/auth/policy.js';
import { testPassword } from './helpers/auth.mjs';
const shop = '00000000-0000-4000-8000-000000000001';
test('staff authentication, permissions, attribution and revocation protect all modules', async (t) => {
  const admin = new pg.Pool({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm',
  });
  const schema = `access_test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(admin.options.connectionString);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url.toString();
  const db = new pg.Pool({ connectionString: url.toString() });
  let app, owner, manager, cashier, viewer;
  async function start() {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
  }
  async function api(
    path,
    body,
    session,
    extra = {},
    method = body === undefined ? 'GET' : 'POST',
  ) {
    const response = await fetch(`${await app.getUrl()}/api/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-AwesomeJM-Request': '1',
        ...(session
          ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken }
          : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie'),
    };
  }
  async function login(username, password = testPassword) {
    const result = await api('/auth/login', { username, password });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return {
      ...result.body,
      cookie: result.cookie.split(';')[0],
      header: result.cookie,
    };
  }
  try {
    execFileSync(process.execPath, ['scripts/migrate.mjs'], {
      cwd: new URL('../', import.meta.url),
      env: process.env,
    });
    const encoded = await hashPassword(testPassword);
    assert(!encoded.includes(testPassword));
    assert(await verifyPassword(testPassword, encoded));
    assert(!(await verifyPassword('incorrect', encoded)));
    for (const role of ['OWNER', 'MANAGER', 'CASHIER', 'VIEWER'])
      await db.query(
        'INSERT INTO staff_users(id,shop_id,username,name,role,password_hash) VALUES($1,$2,$3,$3,$4,$5)',
        [randomUUID(), shop, role.toLowerCase(), role, encoded],
      );
    await start();
    await t.test(
      'every business module requires authentication and rejects cross-origin login',
      async () => {
        for (const path of [
          '/inventory/items',
          '/rates',
          '/customers',
          '/sales',
          '/orders',
          '/purchases',
          '/dashboard',
          '/reports',
          '/auth/staff',
          '/auth/audit',
          '/auth/recovery',
        ])
          assert.equal((await api(path)).status, 401, path);
        assert.equal((await api('/health')).status, 200);
        assert.equal((await api('/auth/session')).body.user, null);
        assert.equal(
          (
            await api(
              '/auth/login',
              { username: 'owner', password: testPassword },
              null,
              { Origin: 'https://untrusted.example' },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await api(
              '/auth/login',
              { username: 'owner', password: testPassword },
              null,
              { 'X-AwesomeJM-Request': '' },
            )
          ).status,
          403,
        );
        const wrong = await api('/auth/login', {
            username: 'owner',
            password: 'wrong',
          }),
          unknown = await api('/auth/login', {
            username: 'unknown',
            password: 'wrong',
          });
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.equal(wrong.body.message, unknown.body.message);
      },
    );
    await t.test(
      'sessions use opaque hashed cookies and CSRF checks',
      async () => {
        owner = await login('owner');
        manager = await login('manager');
        cashier = await login('cashier');
        viewer = await login('viewer');
        assert.match(owner.header, /HttpOnly/);
        assert.match(owner.header, /SameSite=Strict/);
        assert.match(owner.header, /Max-Age=43200/);
        const token = owner.cookie.split('=')[1];
        const saved = await db.query(
          'SELECT token_hash FROM staff_sessions WHERE token_hash=$1',
          [digest(token)],
        );
        assert.equal(saved.rowCount, 1);
        assert.notEqual(saved.rows[0].token_hash, token);
        assert.equal(
          (await api('/auth/session', undefined, owner)).body.user.role,
          'OWNER',
        );
        assert.equal(
          (await api('/inventory/items', {}, owner, { 'X-CSRF-Token': '' }))
            .status,
          403,
        );
        assert.equal(
          (
            await api('/inventory/items', {}, owner, {
              'X-CSRF-Token': 'é'.repeat(64),
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await api('/inventory/items', {}, owner, {
              Origin: 'https://untrusted.example',
            })
          ).status,
          403,
        );
        assert.equal(
          (await api('/auth/staff', undefined, owner)).body.some(
            (member) => 'password_hash' in member,
          ),
          false,
        );
      },
    );
    await t.test(
      'role matrix is enforced before business logic and privileged variants stay restricted',
      async () => {
        const id = randomUUID();
        for (const [path, roles] of [
          ['/inventory/items', ['OWNER', 'MANAGER']],
          ['/rates', ['OWNER', 'MANAGER']],
          ['/customers', ['OWNER', 'MANAGER', 'CASHIER']],
          ['/sales/preview', ['OWNER', 'MANAGER', 'CASHIER']],
          ['/orders', ['OWNER', 'MANAGER', 'CASHIER']],
          ['/purchases/preview', ['OWNER', 'MANAGER']],
          [`/sales/${id}/cancel`, ['OWNER', 'MANAGER']],
          [
            `/customers/${id}/entries/${randomUUID()}/reverse`,
            ['OWNER', 'MANAGER'],
          ],
          ['/auth/staff', ['OWNER']],
        ]) {
          for (const session of [owner, manager, cashier, viewer])
            assert.equal(
              (await api(path, {}, session)).status,
              roles.includes(session.user.role) ? 400 : 403,
              `${session.user.role} ${path}`,
            );
        }
        for (const session of [owner, manager, cashier, viewer])
          assert.equal(
            (await api('/inventory/items', undefined, session)).status,
            200,
          );
        assert.equal(
          (await api('/auth/audit', undefined, manager)).status,
          403,
        );
        assert.equal(
          (
            await api(
              `/orders/${id}/status`,
              {
                requestId: randomUUID(),
                expectedVersion: 1,
                eventDate: '2026-01-01',
                status: 'CANCELLED',
                reason: 'Requested correction',
              },
              cashier,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await api(
              `/customers/${id}/payments`,
              {
                requestId: randomUUID(),
                entryDate: '2026-01-01',
                kind: 'ADVANCE_REFUND',
                amountNpr: '10',
                method: 'CASH',
                reference: '',
                notes: '',
              },
              cashier,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await api(
              '/customers',
              {
                requestId: randomUUID(),
                name: 'Opening balance',
                phone: '',
                pan: '',
                address: '',
                notes: '',
                openedOn: '2026-01-01',
                openingType: 'DUE',
                openingAmountNpr: '10',
                openingReference: 'Old account ledger',
              },
              cashier,
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      'staff access changes require a recent sign-in and passive checks do not extend idle time',
      async () => {
        const token = owner.cookie.split('=')[1];
        await db.query(
          "UPDATE staff_sessions SET created_at=now()-interval '16 minutes' WHERE token_hash=$1",
          [digest(token)],
        );
        assert.equal(
          (
            await api(
              `/auth/staff/${manager.user.id}/revoke-sessions`,
              {},
              owner,
            )
          ).status,
          409,
        );
        assert.equal((await api('/auth/staff', undefined, owner)).status, 200);
        const before = (
          await db.query(
            'SELECT last_seen_at FROM staff_sessions WHERE token_hash=$1',
            [digest(token)],
          )
        ).rows[0].last_seen_at.toISOString();
        assert.equal(
          (await api('/auth/session', undefined, owner)).status,
          200,
        );
        const after = (
          await db.query(
            'SELECT last_seen_at FROM staff_sessions WHERE token_hash=$1',
            [digest(token)],
          )
        ).rows[0].last_seen_at.toISOString();
        assert.equal(after, before);
        owner = await login('owner');
      },
    );
    await t.test(
      'temporary credentials require replacement and password change revokes every device',
      async () => {
        const created = await api(
          '/auth/staff',
          {
            username: 'new-staff',
            name: 'New colleague',
            role: 'CASHIER',
            password: testPassword,
          },
          owner,
        );
        assert.equal(created.status, 201);
        assert.equal(created.body.mustChangePassword, true);
        const first = await login('new-staff'),
          second = await login('new-staff');
        assert.equal((await api('/customers', undefined, first)).status, 403);
        assert.equal(
          (await api('/auth/session', undefined, first)).body.user
            .mustChangePassword,
          true,
        );
        assert.equal(
          (
            await api(
              '/auth/password',
              {
                currentPassword: 'incorrect',
                password: 'Another personal passphrase 991!',
              },
              first,
            )
          ).status,
          400,
        );
        const replacement = 'A different personal passphrase 823!';
        assert.equal(
          (
            await api(
              '/auth/password',
              { currentPassword: testPassword, password: replacement },
              first,
            )
          ).status,
          200,
        );
        assert.equal((await api('/customers', undefined, first)).status, 401);
        assert.equal((await api('/customers', undefined, second)).status, 401);
        const changed = await login('new-staff', replacement);
        assert.equal(changed.user.mustChangePassword, false);
        assert.equal((await api('/customers', undefined, changed)).status, 200);
      },
    );
    await t.test(
      'staff changes revoke sessions and owners cannot remove their own access',
      async () => {
        assert.equal(
          (
            await api(
              `/auth/staff/${owner.user.id}`,
              { name: 'Owner', role: 'VIEWER', active: true },
              owner,
              {},
              'PATCH',
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await api(
              `/auth/staff/${owner.user.id}`,
              { name: 'Owner', role: 'OWNER', active: false },
              owner,
              {},
              'PATCH',
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await api(
              `/auth/staff/${cashier.user.id}`,
              { name: 'Cashier', role: 'VIEWER', active: true },
              owner,
              {},
              'PATCH',
            )
          ).status,
          200,
        );
        assert.equal((await api('/customers', undefined, cashier)).status, 401);
        cashier = await login('cashier');
        assert.equal(cashier.user.role, 'VIEWER');
        assert.equal(
          (
            await api(
              `/auth/staff/${cashier.user.id}/reset-password`,
              { password: 'Temporary replacement phrase 937!' },
              owner,
            )
          ).status,
          200,
        );
        assert.equal((await api('/customers', undefined, cashier)).status, 401);
        assert.equal(
          (
            await api(
              `/auth/staff/${viewer.user.id}/revoke-sessions`,
              {},
              owner,
            )
          ).status,
          200,
        );
        assert.equal((await api('/customers', undefined, viewer)).status, 401);
        viewer = await login('viewer');
        assert.equal(
          (
            await api(
              `/auth/staff/${viewer.user.id}`,
              { name: 'Viewer', role: 'VIEWER', active: false },
              owner,
              {},
              'PATCH',
            )
          ).status,
          200,
        );
        assert.equal((await api('/customers', undefined, viewer)).status, 401);
        assert.equal(
          (
            await api('/auth/login', {
              username: 'viewer',
              password: testPassword,
            })
          ).status,
          401,
        );
      },
    );
    await t.test(
      'each business change is attributed and audit history is immutable',
      async () => {
        const result = await api(
          '/inventory/items',
          {
            itemCode: 'ACCESS-001',
            name: 'Audited ring',
            category: 'Ring',
            metal: 'GOLD',
            fineness: '916.667',
            grossWeightGrams: '11.664',
            nonMetalWeightGrams: '0',
            notes: '',
          },
          manager,
        );
        assert.equal(result.status, 201, JSON.stringify(result.body));
        const audit = await db.query(
          "SELECT actor_id FROM audit_events WHERE resource='inventory_items' AND record_id=$1",
          [result.body.id],
        );
        assert.equal(audit.rows[0].actor_id, manager.user.id);
        const history = await api('/auth/audit', undefined, owner);
        assert.equal(history.status, 200);
        assert(!JSON.stringify(history.body).includes(testPassword));
        assert(!JSON.stringify(history.body).includes(encoded));
        await assert.rejects(
          db.query('DELETE FROM audit_events'),
          /append-only/,
        );
        await assert.rejects(
          db.query("UPDATE audit_events SET action='ERASED'"),
          /append-only/,
        );
        await db.query(
          `INSERT INTO inventory_items(id,shop_id,item_code,name,category,metal,fineness,gross_weight_grams,non_metal_weight_grams,grams_per_tola) VALUES($1,$2,'OPERATOR','Operator import','Ring','GOLD',999,1,0,11.664)`,
          [randomUUID(), shop],
        );
        assert.equal(
          (
            await db.query(
              "SELECT actor_id FROM audit_events WHERE resource='inventory_items' ORDER BY id DESC LIMIT 1",
            )
          ).rows[0].actor_id,
          null,
          'Pool connections must not retain the previous request actor.',
        );
      },
    );
    await t.test(
      'idle/absolute expiration and cross-shop sessions are rejected',
      async () => {
        const expired = await login('manager');
        await db.query(
          "UPDATE staff_sessions SET last_seen_at=now()-interval '31 minutes' WHERE token_hash=$1",
          [digest(expired.cookie.split('=')[1])],
        );
        assert.equal((await api('/customers', undefined, expired)).status, 401);
        const absolute = await login('manager');
        await db.query(
          "UPDATE staff_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
          [digest(absolute.cookie.split('=')[1])],
        );
        assert.equal(
          (await api('/customers', undefined, absolute)).status,
          401,
        );
        const otherShop = randomUUID(),
          other = randomUUID(),
          token = randomBytes(32).toString('hex');
        await db.query('INSERT INTO shops(id,name) VALUES($1,$2)', [
          otherShop,
          'Other shop',
        ]);
        await db.query(
          `INSERT INTO staff_users(id,shop_id,username,name,role,password_hash) VALUES($1,$2,'other','Other owner','OWNER',$3)`,
          [other, otherShop, encoded],
        );
        await db.query(
          "INSERT INTO staff_sessions(token_hash,shop_id,staff_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
          [digest(token), otherShop, other],
        );
        assert.equal(
          (
            await api('/customers', undefined, {
              cookie: `ajm_session=${token}`,
              csrfToken: csrfToken(token),
            })
          ).status,
          401,
        );
      },
    );
    await t.test(
      'login limits survive a restart and logout revokes the current session',
      async () => {
        for (let i = 0; i < 10; i++)
          assert.equal(
            (
              await api('/auth/login', {
                username: 'throttle-user',
                password: 'wrong',
              })
            ).status,
            401,
          );
        await app.close();
        await start();
        assert.equal(
          (
            await api('/auth/login', {
              username: 'throttle-user',
              password: 'wrong',
            })
          ).status,
          429,
        );
        assert.equal((await api('/customers', undefined, owner)).status, 200);
        assert.equal((await api('/auth/logout', {}, owner)).status, 200);
        assert.equal((await api('/customers', undefined, owner)).status, 401);
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
test('production startup requires explicit database and HTTPS app origin', () => {
  const saved = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    APP_ORIGIN: process.env.APP_ORIGIN,
  };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    assert.throws(validateAccessConfig, /DATABASE_URL/);
    process.env.DATABASE_URL = 'postgres://configured';
    process.env.APP_ORIGIN = 'http://shop.example';
    assert.throws(validateAccessConfig, /HTTPS/);
    process.env.APP_ORIGIN = 'https://shop.example';
    assert.doesNotThrow(validateAccessConfig);
  } finally {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});

test('production cookies are host-bound, secure, HTTP-only and clear with matching attributes', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    let header = '';
    const response = {
      setHeader(_key, value) {
        header = value;
      },
    };
    const auth = new AuthService({});
    auth.cookie(response, 'a'.repeat(64));
    assert.match(header, /^__Host-ajm_session=/);
    assert.match(header, /; Secure/);
    assert.match(header, /; HttpOnly/);
    assert.match(header, /SameSite=Strict/);
    assert(!header.includes('Domain='));
    auth.cookie(response, null);
    assert.match(header, /Max-Age=0/);
    assert.match(header, /; Secure/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
