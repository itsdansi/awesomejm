import { Buffer } from 'node:buffer';
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, readFile, stat, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
export async function outsideRepository(path, existing = true) {
  const root = await realpath(
    fileURLToPath(new URL('../../../../', import.meta.url)),
  );
  const actual = existing
    ? await realpath(path)
    : resolve(await realpath(dirname(resolve(path))), basename(path));
  if (actual === root || actual.startsWith(root + sep))
    throw new Error(
      'Keep backup archives and recovery keys outside the source repository.',
    );
  return actual;
}
export const magic = Buffer.from('AJMBK001');
export const schema = process.env.BACKUP_SCHEMA ?? 'public';
if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
  throw new Error(
    'BACKUP_SCHEMA must be a simple lowercase PostgreSQL identifier.',
  );
export const sourceUrl =
  process.env.DATABASE_URL ??
  'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm';
export const adminUrl = process.env.RECOVERY_ADMIN_URL ?? sourceUrl;
export const quote = (value) => `"${value.replaceAll('"', '""')}"`;
export function pool(url = sourceUrl) {
  return new pg.Pool({
    connectionString: url,
    connectionTimeoutMillis: 5000,
    max: 2,
  });
}
export async function key() {
  const path = process.env.BACKUP_KEY_FILE;
  if (!path)
    throw new Error(
      'Set BACKUP_KEY_FILE to a private file containing a 32-byte base64 key.',
    );
  await outsideRepository(path);
  const info = await stat(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    throw new Error(
      'Backup key must be a regular file with mode 0600 or stricter.',
    );
  const value = Buffer.from((await readFile(path, 'utf8')).trim(), 'base64');
  if (value.length !== 32) throw new Error('Invalid backup key.');
  return value;
}
export function pgTool(tool, args, url) {
  const u = new URL(url);
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:')
    throw new Error('Invalid PostgreSQL URL.');
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  };
  // Pass connection secrets only via environment; never command-line arguments.
  if (u.searchParams.has('sslmode'))
    env.PGSSLMODE = u.searchParams.get('sslmode');
  if (u.searchParams.has('options'))
    env.PGOPTIONS = u.searchParams.get('options');
  else delete env.PGOPTIONS;
  let child;
  if (process.env.PG_TOOLS === 'docker') {
    if (
      !['localhost', '127.0.0.1'].includes(u.hostname) ||
      u.searchParams.has('sslmode')
    )
      throw new Error(
        'Docker tools are for the local Compose database only. Use installed PostgreSQL tools in production.',
      );
    const names = [
      'PGUSER',
      'PGPASSWORD',
      'PGDATABASE',
      ...(env.PGOPTIONS ? ['PGOPTIONS'] : []),
    ];
    const command = process.env.PG_CONTAINER
      ? [
          'exec',
          '-i',
          ...names.flatMap((name) => ['-e', name]),
          process.env.PG_CONTAINER,
          tool,
          ...args,
        ]
      : [
          'compose',
          'exec',
          '-T',
          ...names.flatMap((name) => ['-e', name]),
          'db',
          tool,
          ...args,
        ];
    child = spawn('docker', command, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  } else child = spawn(tool, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let errorText = '';
  child.stderr.on('data', (data) => {
    errorText = (errorText + data.toString()).slice(-4000);
  });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${tool} failed (${code}). Check PostgreSQL tool version, access and database availability. ${errorText.replaceAll(env.PGPASSWORD || '__no_password__', '[redacted]')}`,
            ),
          ),
    );
  });
  // Prevent rejection becoming unhandled while streams are being attached.
  completed.catch(() => {});
  return { child, completed };
}
export async function fingerprints(c, namespace = schema) {
  await c.query("SET LOCAL TIME ZONE 'UTC'");
  await c.query("SET LOCAL DateStyle TO 'ISO, YMD'");
  const tables = (
    await c.query(
      `SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename COLLATE "C"`,
      [namespace],
    )
  ).rows.map((row) => row.tablename);
  const result = [];
  for (const table of tables) {
    const hash = createHash('sha256');
    let count = 0;
    await c.query(
      `DECLARE backup_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM ${quote(namespace)}.${quote(table)} t ORDER BY to_jsonb(t)::text COLLATE "C"`,
    );
    try {
      for (;;) {
        const batch = await c.query('FETCH 500 FROM backup_rows');
        if (!batch.rowCount) break;
        for (const row of batch.rows) {
          hash.update(row.row);
          hash.update('\n');
          count++;
        }
      }
    } finally {
      await c.query('CLOSE backup_rows');
    }
    result.push({ table, rows: count, sha256: hash.digest('hex') });
  }
  return result;
}
export async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function encryptDump(path, manifest, snapshot, secret) {
  const iv = randomBytes(12),
    header = Buffer.from(
      JSON.stringify({ ...manifest, iv: iv.toString('base64') }),
    );
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  const aad = Buffer.concat([magic, length, header]);
  const cipher = createCipheriv('aes-256-gcm', secret, iv);
  cipher.setAAD(aad);
  const file = await open(path, 'wx', 0o600);
  try {
    await file.write(aad);
  } finally {
    await file.close();
  }
  const tool = pgTool(
    'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--schema=${schema}`,
      `--snapshot=${snapshot}`,
    ],
    sourceUrl,
  );
  try {
    await Promise.all([
      pipeline(
        tool.child.stdout,
        cipher,
        createWriteStream(path, { flags: 'a', mode: 0o600 }),
      ),
      tool.completed,
    ]);
    const out = await open(path, 'a');
    try {
      await out.write(cipher.getAuthTag());
    } finally {
      await out.close();
    }
  } catch (error) {
    tool.child.kill('SIGTERM');
    throw error;
  }
}
export async function readArchive(path, secret) {
  const handle = await open(path, 'r');
  try {
    const size = (await handle.stat()).size,
      prefix = Buffer.alloc(12);
    await handle.read(prefix, 0, 12, 0);
    if (!prefix.subarray(0, 8).equals(magic))
      throw new Error('Unsupported backup format.');
    const length = prefix.readUInt32BE(8);
    if (length < 1 || length > 1024 * 1024 || size < 12 + length + 17)
      throw new Error('Invalid backup envelope.');
    const header = Buffer.alloc(length);
    await handle.read(header, 0, length, 12);
    const manifest = JSON.parse(header.toString('utf8'));
    if (
      manifest.version !== 1 ||
      !Array.isArray(manifest.tables) ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(manifest.schema) ||
      typeof manifest.createdAt !== 'string'
    )
      throw new Error('Invalid backup manifest.');
    const tag = Buffer.alloc(16);
    await handle.read(tag, 0, 16, size - 16);
    const aad = Buffer.concat([prefix, header]),
      iv = Buffer.from(manifest.iv, 'base64');
    if (iv.length !== 12) throw new Error('Invalid backup IV.');
    return {
      manifest,
      decrypt: () => {
        const decipher = createDecipheriv('aes-256-gcm', secret, iv);
        decipher.setAAD(aad);
        decipher.setAuthTag(tag);
        return {
          input: createReadStream(path, { start: 12 + length, end: size - 17 }),
          decipher,
        };
      },
    };
  } finally {
    await handle.close();
  }
}
export async function restoreArchive(path, archive, target) {
  const tool = pgTool(
    'pg_restore',
    [
      '--dbname',
      decodeURIComponent(new URL(target).pathname.slice(1)),
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--exit-on-error',
    ],
    target,
  );
  tool.child.stdout.resume();
  const { input, decipher } = archive.decrypt();
  try {
    await Promise.all([
      pipeline(input, decipher, tool.child.stdin),
      tool.completed,
    ]);
  } catch (error) {
    tool.child.kill('SIGTERM');
    throw error;
  }
}
export function targetUrl(database) {
  const u = new URL(adminUrl);
  u.pathname = `/${database}`;
  u.searchParams.delete('options');
  return u.toString();
}
export function absoluteArchive(value) {
  if (!value) throw new Error('Supply the encrypted backup path.');
  return resolve(value);
}
