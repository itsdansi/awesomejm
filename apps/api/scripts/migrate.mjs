import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm',
  connectionTimeoutMillis: 5000,
});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(82410723)');
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const dir = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(dir))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const applied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name],
    );
    if (applied.rowCount) continue;
    await client.query(await readFile(new URL(name, dir), 'utf8'));
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
      name,
    ]);
    console.info(`Applied ${name}`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
