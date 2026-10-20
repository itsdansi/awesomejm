import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  outsideRepository,
  key,
  pool,
  schema,
  encryptDump,
  fingerprints,
  fileHash,
} from './lib/recovery.mjs';
if (process.argv[2] === 'keygen') {
  const path = process.argv[3];
  if (!path)
    throw new Error(
      'Supply a path outside the repository for the recovery key.',
    );
  await outsideRepository(path, false);
  await writeFile(resolve(path), randomBytes(32).toString('base64') + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  console.info(
    'Recovery key created with private permissions. Store a separate secure copy.',
  );
} else {
  const secret = await key(),
    dir = process.env.BACKUP_DIR;
  if (!dir) throw new Error('Set BACKUP_DIR outside the repository.');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await outsideRepository(dir);
  const p = pool(),
    c = await p.connect();
  const now = new Date(),
    id = randomUUID(),
    name = `awesomejm-${now.toISOString().replaceAll(':', '-')}-${id.slice(0, 8)}.ajmbak`,
    path = join(resolve(dir), name),
    temporary = path + '.partial';
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = (await c.query('SELECT pg_export_snapshot() AS id'))
      .rows[0].id;
    const tables = await fingerprints(c);
    if (
      !tables.some((t) => t.table === 'staff_users') ||
      !tables.some((t) => t.table === 'schema_migrations')
    )
      throw new Error(
        'The selected backup schema is not a migrated AwesomeJM database.',
      );
    await encryptDump(
      temporary,
      { version: 1, id, createdAt: now.toISOString(), schema, tables },
      snapshot,
      secret,
    );
    await c.query('COMMIT');
    await rename(temporary, path);
    const sha256 = await fileHash(path),
      size = (await stat(path)).size;
    await c.query(
      `INSERT INTO ${'"' + schema + '"'}.backup_runs(id,file_name,created_at,size_bytes,sha256) VALUES($1,$2,$3,$4,$5)`,
      [id, basename(path), now, size, sha256],
    );
    console.info(
      `Encrypted backup created: ${path}\nSHA256: ${sha256}\nRun db:verify-backup with this path before relying on it.`,
    );
    if (process.argv.includes('--verify')) {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('./restore.mjs', import.meta.url)),
          'verify',
          path,
        ],
        { env: process.env, stdio: 'inherit' },
      );
      await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(
                  'Backup created, but restore verification failed. Do not mark this run as verified.',
                ),
              ),
        );
      });
    }
  } catch (error) {
    await c.query('ROLLBACK').catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  } finally {
    c.release();
    await p.end();
  }
}
