import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  key,
  pool,
  readArchive,
  restoreArchive,
  fingerprints,
  fileHash,
  quote,
  targetUrl,
  absoluteArchive,
} from './lib/recovery.mjs';
const mode = process.argv[2];
if (!['verify', 'restore'].includes(mode))
  throw new Error('Use verify or restore.');
const path = absoluteArchive(process.argv[3]),
  secret = await key();
const archive = await readArchive(path, secret);
// Authenticate the entire archive before creating a database or invoking pg_restore.
{
  const { input, decipher } = archive.decrypt();
  await pipeline(
    input,
    decipher,
    new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  );
}
const database =
  mode === 'verify'
    ? `ajm_verify_${randomUUID().replaceAll('-', '')}`
    : process.argv[4];
if (
  !database ||
  !/^ajm_(verify|recovered)_[a-z0-9_]{1,48}$/.test(database) ||
  (mode === 'restore' && !database.startsWith('ajm_recovered_'))
)
  throw new Error(
    'Restore requires a NEW database name beginning ajm_recovered_. Existing databases are never overwritten.',
  );
const admin = pool(process.env.RECOVERY_ADMIN_URL),
  started = Date.now();
let created = false,
  verified = false,
  target;
try {
  await admin.query(`CREATE DATABASE ${quote(database)} TEMPLATE template0`);
  created = true;
  const url = targetUrl(database);
  target = pool(url);
  // template0 supplies an empty public schema; a schema-scoped pg_dump creates it.
  if (archive.manifest.schema === 'public')
    await target.query('DROP SCHEMA public');
  await restoreArchive(path, archive, url);
  const c = await target.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actual = await fingerprints(c, archive.manifest.schema);
    if (!isDeepStrictEqual(actual, archive.manifest.tables))
      throw new Error(
        'Restored table counts or contents differ from the backup snapshot.',
      );
    const invalid = await c.query(
      'SELECT count(*)::int AS n FROM pg_constraint WHERE connamespace=$1::regnamespace AND NOT convalidated',
      [archive.manifest.schema],
    );
    if (invalid.rows[0].n)
      throw new Error('Restored constraints are not validated.');
    const sequence = (
      await c.query('SELECT pg_get_serial_sequence($1,$2) AS name', [
        `${quote(archive.manifest.schema)}.audit_events`,
        'id',
      ])
    ).rows[0].name;
    const maxId = (
      await c.query(
        `SELECT COALESCE(max(id),0)::text AS id FROM ${quote(archive.manifest.schema)}.audit_events`,
      )
    ).rows[0].id;
    const sequenceState = (
      await c.query(
        `SELECT last_value::text AS value,is_called FROM ${sequence}`,
      )
    ).rows[0];
    if (
      BigInt(sequenceState.value) < BigInt(maxId) ||
      (!sequenceState.is_called && BigInt(sequenceState.value) <= BigInt(maxId))
    )
      throw new Error(
        'Restored audit sequence would reuse an existing identifier.',
      );
    await c.query('COMMIT');
    await c.query(
      `DELETE FROM ${quote(archive.manifest.schema)}.staff_sessions`,
    );
    await c.query(`DELETE FROM ${quote(archive.manifest.schema)}.login_limits`);
    verified = true;
  } finally {
    c.release();
  }
  const sha256 = await fileHash(path),
    evidence = {
      version: 1,
      file: basename(path),
      sha256,
      backupCreatedAt: archive.manifest.createdAt,
      verifiedAt: new Date().toISOString(),
      database,
      mode,
      tables: archive.manifest.tables,
      durationMs: Date.now() - started,
      sessionsRevoked: true,
    };
  await writeFile(
    `${path}.${mode}.json`,
    JSON.stringify(evidence, null, 2) + '\n',
    { mode: 0o600 },
  );
  // Record operator verification status on the source database, never restore business data into it.
  if (mode === 'verify') {
    const source = pool();
    try {
      await source.query(
        `UPDATE ${quote(archive.manifest.schema)}.backup_runs SET verified_at=$1,table_count=$2 WHERE sha256=$3`,
        [evidence.verifiedAt, evidence.tables.length, sha256],
      );
    } finally {
      await source.end();
    }
  }
  console.info(
    `${mode === 'verify' ? 'Restore verification passed' : 'Recovery database ready'}: ${database}\nCompared ${archive.manifest.tables.length} tables, exact row counts and SHA256 contents; constraints valid; restored sessions revoked.\nEvidence: ${path}.${mode}.json${mode === 'restore' ? '\nStop app writes and update DATABASE_URL only after the recovery runbook checks.' : ''}`,
  );
} catch (error) {
  console.error(
    'Restore did not pass. The application database was not overwritten.',
  );
  throw error;
} finally {
  await target?.end();
  // Only databases created by this invocation can be removed.
  if (created && (mode === 'verify' || !verified))
    await admin.query(`DROP DATABASE ${quote(database)} WITH (FORCE)`);
  await admin.end();
}
