import { randomUUID, randomBytes } from 'node:crypto';
import { digest, csrfToken } from '../../dist/auth/auth.service.js';
import { hashPassword } from '../../dist/auth/password.js';
export const testPassword = 'A long test-only password 472!';
export async function authenticatedFetch(db) {
  const id = randomUUID(),
    token = randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO staff_users(id,shop_id,username,name,role,password_hash) VALUES($1,'00000000-0000-4000-8000-000000000001','test-owner','Test owner','OWNER',$2)`,
    [id, await hashPassword(testPassword)],
  );
  await db.query(
    `INSERT INTO staff_sessions(token_hash,shop_id,staff_id,expires_at) VALUES($1,'00000000-0000-4000-8000-000000000001',$2,now()+interval '12 hours')`,
    [digest(token), id],
  );
  return (url, init = {}) =>
    globalThis.fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Cookie: `ajm_session=${token}`,
        'X-CSRF-Token': csrfToken(token),
        'X-AwesomeJM-Request': '1',
      },
    });
}
