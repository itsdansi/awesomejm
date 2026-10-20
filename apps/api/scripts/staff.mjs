import { randomUUID } from 'node:crypto';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import pg from 'pg';
import {
  createStaffSchema,
  passwordSchema,
  usernameSchema,
} from '@awesomejm/contracts';
import { hashPassword } from '../dist/auth/password.js';
const mode = process.argv[2];
if (!['owner', 'reset'].includes(mode))
  throw new Error('Use staff:owner or staff:reset.');
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgres://awesomejm:awesomejm_dev@127.0.0.1:5433/awesomejm',
  connectionTimeoutMillis: 5000,
});
const shop = process.env.APP_SHOP_ID ?? '00000000-0000-4000-8000-000000000001';
let muted = false;
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!muted) stdout.write(chunk);
    done();
  },
});
const terminal = createInterface({ input: stdin, output, terminal: true });
async function secret(prompt) {
  stdout.write(prompt);
  muted = true;
  try {
    return await terminal.question('');
  } finally {
    muted = false;
    stdout.write('\n');
  }
}
let client;
try {
  if (!stdin.isTTY)
    throw new Error(
      'Run this command in an interactive terminal. Passwords are never accepted in arguments or environment variables.',
    );
  const username = usernameSchema.parse(await terminal.question('Username: '));
  const name =
    mode === 'owner' ? (await terminal.question('Display name: ')).trim() : '';
  const password = passwordSchema.parse(
    await secret('New password (hidden, 15–128 characters): '),
  );
  if (password !== (await secret('Confirm password (hidden): ')))
    throw new Error('Passwords do not match.');
  const encoded = await hashPassword(password);
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `staff-management:${shop}`,
  ]);
  if (mode === 'owner') {
    createStaffSchema.parse({ username, name, password, role: 'OWNER' });
    if (
      (
        await client.query(
          `SELECT 1 FROM staff_users WHERE shop_id=$1 AND active AND role='OWNER'`,
          [shop],
        )
      ).rowCount
    )
      throw new Error(
        'An active owner already exists. Use owner-managed staff access, or staff:reset for recovery.',
      );
    const id = randomUUID();
    await client.query(
      `INSERT INTO staff_users(id,shop_id,username,name,role,password_hash) VALUES($1,$2,$3,$4,'OWNER',$5)`,
      [id, shop, username, name, encoded],
    );
    await client.query(
      `INSERT INTO audit_events(shop_id,action,resource,record_id,details) VALUES($1,'OWNER_BOOTSTRAPPED','staff',$2,'{"source":"operator-cli"}')`,
      [shop, id],
    );
  } else {
    const member = (
      await client.query(
        'UPDATE staff_users SET password_hash=$1,must_change_password=false WHERE shop_id=$2 AND username=$3 AND active RETURNING id',
        [encoded, shop, username],
      )
    ).rows[0];
    if (!member)
      throw new Error(
        'No active account with this username. Disabled accounts must be re-enabled by an owner.',
      );
    await client.query(
      'DELETE FROM staff_sessions WHERE shop_id=$1 AND staff_id=$2',
      [shop, member.id],
    );
    await client.query(
      `INSERT INTO audit_events(shop_id,action,resource,record_id,details) VALUES($1,'OPERATOR_PASSWORD_RESET','staff',$2,'{"source":"operator-cli"}')`,
      [shop, member.id],
    );
  }
  await client.query('COMMIT');
  stdout.write(
    mode === 'owner'
      ? 'Owner created. Sign in using your chosen credentials.\n'
      : 'Password reset. All sessions revoked.\n',
  );
} catch (error) {
  if (client) await client.query('ROLLBACK');
  console.error(error instanceof Error ? error.message : 'Staff setup failed.');
  process.exitCode = 1;
} finally {
  terminal.close();
  client?.release();
  await pool.end();
}
