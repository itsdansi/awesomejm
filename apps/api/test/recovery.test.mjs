import { Buffer } from 'node:buffer';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { AppModule } from '../dist/app.module.js';
import { authenticatedFetch, testPassword } from './helpers/auth.mjs';
test('encrypted backups restore exact database contents and verify recovery without overwriting live data', async (t) => {
  const adminUrl =
    process.env.TEST_DATABASE_URL ??
    'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm';
  const admin = new pg.Pool({ connectionString: adminUrl }),
    suffix = randomUUID().replaceAll('-', ''),
    database = `ajm_backup_source_${suffix}`,
    restored = `ajm_recovered_${suffix}`;
  const dir = await mkdtemp(join(tmpdir(), 'ajm-recovery-')),
    keyFile = join(dir, 'key.recovery-key');
  await writeFile(keyFile, randomBytes(32).toString('base64'), { mode: 0o600 });
  await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`);
  const sourceUrl = new URL(adminUrl);
  sourceUrl.pathname = `/${database}`;
  sourceUrl.searchParams.delete('options');
  const env = {
    ...process.env,
    DATABASE_URL: sourceUrl.toString(),
    RECOVERY_ADMIN_URL: adminUrl,
    BACKUP_DIR: dir,
    BACKUP_KEY_FILE: keyFile,
    BACKUP_SCHEMA: 'public',
    PG_TOOLS: process.env.PG_TOOLS ?? 'docker',
  };
  const db = new pg.Pool({ connectionString: sourceUrl.toString() });
  const cwd = new URL('../', import.meta.url);
  const previous = process.env.DATABASE_URL;
  let app, archive;
  const runtimeRole = `ajm_runtime_${suffix}`;
  let roleCreated = false;
  function command(script, args = [], overrides = {}) {
    return execFileSync(process.execPath, [`scripts/${script}.mjs`, ...args], {
      cwd,
      env: { ...env, ...overrides },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  try {
    command('migrate');
    const fetch = await authenticatedFetch(db);
    process.env.DATABASE_URL = sourceUrl.toString();
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const response = await fetch(
      `${await app.getUrl()}/api/v1/inventory/items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemCode: 'RECOVER-001',
          name: 'Recovery test ring',
          category: 'Ring',
          metal: 'GOLD',
          fineness: '916.667',
          grossWeightGrams: '11.664',
          nonMetalWeightGrams: '0',
          notes: 'Retain exact inventory',
        }),
      },
    );
    assert.equal(response.status, 201);
    await t.test(
      'backup is encrypted and reports an unverified archive',
      async () => {
        const output = command('backup');
        assert.match(output, /Encrypted backup created/);
        archive = join(
          dir,
          (await readdir(dir)).find((name) => name.endsWith('.ajmbak')),
        );
        const contents = await readFile(archive);
        assert.equal(contents.subarray(0, 8).toString(), 'AJMBK001');
        assert(!contents.includes(Buffer.from('Recovery test ring')));
        assert(!contents.includes(Buffer.from('PGDMP')));
        const row = (await db.query('SELECT verified_at FROM backup_runs'))
          .rows[0];
        assert.equal(row.verified_at, null);
      },
    );
    await t.test(
      'verification really restores and compares all table contents then removes its temporary database',
      async () => {
        const output = command('restore', ['verify', archive]);
        assert.match(output, /Restore verification passed/);
        const evidence = JSON.parse(
          await readFile(archive + '.verify.json', 'utf8'),
        );
        assert(
          evidence.tables.some(
            (row) => row.table === 'inventory_items' && row.rows === 1,
          ),
        );
        assert(
          evidence.tables.some(
            (row) => row.table === 'staff_users' && row.rows === 1,
          ),
        );
        assert(
          evidence.tables.some(
            (row) => row.table === 'audit_events' && row.rows === 2,
          ),
        );
        assert.equal(
          (
            await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [
              evidence.database,
            ])
          ).rowCount,
          0,
        );
        const row = (
          await db.query('SELECT verified_at,table_count FROM backup_runs')
        ).rows[0];
        assert(row.verified_at);
        assert.equal(row.table_count, evidence.tables.length);
      },
    );
    await t.test(
      'corruption, wrong key and unsafe destinations fail without changing live data',
      async () => {
        const wrong = join(dir, 'wrong.recovery-key');
        await writeFile(wrong, randomBytes(32).toString('base64'), {
          mode: 0o600,
        });
        assert.throws(() =>
          command('restore', ['verify', archive], { BACKUP_KEY_FILE: wrong }),
        );
        const bad = join(dir, 'corrupt.ajmbak'),
          bytes = await readFile(archive);
        bytes[bytes.length - 20] ^= 1;
        await writeFile(bad, bytes, { mode: 0o600 });
        assert.throws(() => command('restore', ['verify', bad]));
        assert.throws(() => command('restore', ['restore', archive, database]));
        await chmod(keyFile, 0o644);
        assert.throws(() => command('restore', ['verify', archive]));
        await chmod(keyFile, 0o600);
        assert.equal(
          (await db.query('SELECT count(*)::int AS n FROM inventory_items'))
            .rows[0].n,
          1,
        );
      },
    );
    await t.test(
      'recovery keeps a new database, revokes restored sessions and supports signing in',
      async () => {
        const output = command('restore', ['restore', archive, restored]);
        assert.match(output, /Recovery database ready/);
        assert.throws(() => command('restore', ['restore', archive, restored]));
        await app.close();
        const recoveredUrl = new URL(sourceUrl);
        recoveredUrl.pathname = `/${restored}`;
        process.env.DATABASE_URL = recoveredUrl.toString();
        app = await NestFactory.create(AppModule, { logger: false });
        app.setGlobalPrefix('api/v1');
        await app.listen(0, '127.0.0.1');
        assert.equal(
          (await fetch(`${await app.getUrl()}/api/v1/inventory/items`)).status,
          401,
          'Sessions from the backup must not survive recovery.',
        );
        const login = await globalThis.fetch(
          `${await app.getUrl()}/api/v1/auth/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-AwesomeJM-Request': '1',
            },
            body: JSON.stringify({
              username: 'test-owner',
              password: testPassword,
            }),
          },
        );
        assert.equal(login.status, 200);
        const stock = await globalThis.fetch(
          `${await app.getUrl()}/api/v1/inventory/items`,
          {
            headers: { Cookie: login.headers.get('set-cookie').split(';')[0] },
          },
        );
        assert.equal(stock.status, 200);
        assert.equal((await stock.json()).items[0].itemCode, 'RECOVER-001');
      },
    );
    await t.test(
      'restricted runtime grants support sign-in and audited writes but block DDL and history deletion',
      async () => {
        await app.close();
        await admin.query(
          `CREATE ROLE ${runtimeRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
        );
        roleCreated = true;
        const recoveredUrl = new URL(sourceUrl);
        recoveredUrl.pathname = `/${restored}`;
        const operator = new pg.Pool({
          connectionString: recoveredUrl.toString(),
        });
        try {
          const grants = (
            await readFile(
              new URL('../../../ops/runtime-grants.sql', import.meta.url),
              'utf8',
            )
          ).replaceAll('ajm_runtime', runtimeRole);
          await operator.query(grants);
        } finally {
          await operator.end();
        }
        recoveredUrl.searchParams.set('options', `-c role=${runtimeRole}`);
        process.env.DATABASE_URL = recoveredUrl.toString();
        const restricted = new pg.Pool({
          connectionString: recoveredUrl.toString(),
        });
        try {
          assert.equal(
            (await restricted.query('SELECT current_user AS name')).rows[0]
              .name,
            runtimeRole,
          );
          await assert.rejects(
            restricted.query('DELETE FROM audit_events'),
            /permission denied/,
          );
          await assert.rejects(
            restricted.query('TRUNCATE inventory_items'),
            /permission denied/,
          );
          await assert.rejects(
            restricted.query('CREATE TABLE unsafe_table(id int)'),
            /permission denied/,
          );
          await assert.rejects(
            restricted.query('DELETE FROM backup_runs'),
            /permission denied/,
          );
        } finally {
          await restricted.end();
        }
        app = await NestFactory.create(AppModule, { logger: false });
        app.setGlobalPrefix('api/v1');
        await app.listen(0, '127.0.0.1');
        const login = await globalThis.fetch(
          `${await app.getUrl()}/api/v1/auth/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-AwesomeJM-Request': '1',
            },
            body: JSON.stringify({
              username: 'test-owner',
              password: testPassword,
            }),
          },
        );
        assert.equal(login.status, 200);
        const session = await login.json();
        const posted = await globalThis.fetch(
          `${await app.getUrl()}/api/v1/inventory/items`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-AwesomeJM-Request': '1',
              'X-CSRF-Token': session.csrfToken,
              Cookie: login.headers.get('set-cookie').split(';')[0],
            },
            body: JSON.stringify({
              itemCode: 'RUNTIME-001',
              name: 'Runtime role ring',
              category: 'Ring',
              metal: 'GOLD',
              fineness: '916.667',
              grossWeightGrams: '11.664',
              nonMetalWeightGrams: '0',
              notes: '',
            }),
          },
        );
        assert.equal(posted.status, 201, JSON.stringify(await posted.json()));
      },
    );
  } finally {
    await app?.close();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${restored} WITH (FORCE)`);
    await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
    if (roleCreated) await admin.query(`DROP ROLE ${runtimeRole}`);
    await admin.end();
    await rm(dir, { recursive: true, force: true });
  }
});
