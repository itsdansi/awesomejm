import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  currentStaffSchema,
  rolePermissions,
  staffSchema,
  type CurrentStaff,
  type StaffRole,
} from '@awesomejm/contracts';
import type pg from 'pg';
import { DatabaseService } from '../database/database.service.js';
import { SHOP_ID } from '../shop/shop.js';
import { dummyHash, hashPassword, verifyPassword } from './password.js';
import { digestCookieName, type CookieResponse } from './policy.js';
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const csrfToken = (token: string) => digest(`csrf:${token}`);
const columns = `id,username,name,role,active,must_change_password AS "mustChangePassword",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`;
@Injectable()
export class AuthService {
  private hashes = 0;
  constructor(private readonly db: DatabaseService) {}
  async passwordOperation<T>(operation: () => Promise<T>) {
    if (this.hashes >= 2)
      throw new HttpException(
        'Sign-in is busy. Please try again shortly.',
        429,
      );
    this.hashes++;
    try {
      return await operation();
    } finally {
      this.hashes--;
    }
  }
  cookie(response: CookieResponse, token: string | null) {
    response.setHeader(
      'Set-Cookie',
      `${digestCookieName()}=${token ?? ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 43200 : 0}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    );
  }
  async userForSession(
    token: string,
    touch = true,
  ): Promise<CurrentStaff | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    return this.db.run(async (c) => {
      const result = await c.query(
        `UPDATE staff_sessions SET last_seen_at=CASE WHEN $3 THEN clock_timestamp() ELSE last_seen_at END WHERE token_hash=$1 AND shop_id=$2 AND expires_at>clock_timestamp() AND last_seen_at>clock_timestamp()-interval '30 minutes' RETURNING staff_id`,
        [digest(token), SHOP_ID, touch],
      );
      if (!result.rowCount) return null;
      return this.loadUser(c, result.rows[0].staff_id);
    });
  }
  async requireRecentSignIn(token: string) {
    const recent = await this.db.run(
      async (c) =>
        (
          await c.query(
            "SELECT 1 FROM staff_sessions WHERE token_hash=$1 AND shop_id=$2 AND created_at>clock_timestamp()-interval '15 minutes'",
            [digest(token), SHOP_ID],
          )
        ).rowCount,
    );
    if (!recent)
      throw new ConflictException(
        'Sign out and sign in again before changing staff access. A recent sign-in is required.',
      );
  }
  async passwordBudget(id: string) {
    const attempts = await this.db.run(
      async (c) =>
        (
          await c.query(
            `INSERT INTO login_limits(key,attempts,window_start) VALUES($1,1,clock_timestamp()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_limits.window_start<clock_timestamp()-interval '15 minutes' THEN 1 ELSE login_limits.attempts+1 END,window_start=CASE WHEN login_limits.window_start<clock_timestamp()-interval '15 minutes' THEN clock_timestamp() ELSE login_limits.window_start END RETURNING attempts`,
            [digest(`password:${SHOP_ID}:${id}`)],
          )
        ).rows[0].attempts as number,
    );
    if (attempts > 10)
      throw new HttpException(
        'Too many password attempts. Try again in 15 minutes.',
        429,
      );
  }
  async loadUser(c: pg.PoolClient, id: string) {
    const result = await c.query(
      `SELECT ${columns},shop_id AS "shopId",(SELECT name FROM shops WHERE id=$2) AS "shopName" FROM staff_users WHERE id=$1 AND shop_id=$2 AND active`,
      [id, SHOP_ID],
    );
    if (!result.rowCount) return null;
    return currentStaffSchema.parse({
      ...result.rows[0],
      permissions: rolePermissions(result.rows[0].role),
    });
  }
  async event(
    c: pg.PoolClient,
    user: CurrentStaff | null,
    action: string,
    recordId: string | null,
    details: Record<string, unknown> = {},
  ) {
    await c.query(
      `INSERT INTO audit_events(shop_id,actor_id,actor_name,actor_username,action,resource,record_id,details) VALUES($1,$2,$3,$4,$5,'staff',$6,$7)`,
      [
        SHOP_ID,
        user?.id ?? null,
        user?.name ?? null,
        user?.username ?? null,
        action,
        recordId,
        details,
      ],
    );
  }
  async login(username: string, password: string, ip: string) {
    // Reserve persistent account and network attempt budgets before expensive hashing.
    const permitted = await this.db.run(async (c) => {
      await c.query(
        `DELETE FROM login_limits WHERE window_start<clock_timestamp()-interval '1 day'`,
      );
      let permitted = true;
      for (const [key, max] of [
        [`account:${SHOP_ID}:${username}`, 10],
        [`network:${ip}`, 50],
      ] as const) {
        const result = await c.query(
          `INSERT INTO login_limits(key,attempts,window_start) VALUES($1,1,clock_timestamp()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_limits.window_start<clock_timestamp()-interval '15 minutes' THEN 1 ELSE login_limits.attempts+1 END,window_start=CASE WHEN login_limits.window_start<clock_timestamp()-interval '15 minutes' THEN clock_timestamp() ELSE login_limits.window_start END RETURNING attempts`,
          [digest(key)],
        );
        if (result.rows[0].attempts > max) permitted = false;
      }
      return permitted;
    }, true);
    if (!permitted)
      throw new HttpException(
        'Too many sign-in attempts. Try again in 15 minutes.',
        429,
      );
    const account = await this.db.run(
      async (c) =>
        (
          await c.query(
            `SELECT id,password_hash,active FROM staff_users WHERE shop_id=$1 AND username=$2`,
            [SHOP_ID, username],
          )
        ).rows[0],
    );
    const matches = await this.passwordOperation(() =>
      verifyPassword(password, account?.password_hash ?? dummyHash),
    );
    if (!matches || !account?.active) {
      await this.db.run((c) =>
        this.event(c, null, 'LOGIN_FAILED', null, {
          loginKey: digest(`${SHOP_ID}:${username}`),
        }),
      );
      throw new UnauthorizedException('Username or password is incorrect.');
    }
    return this.db.run(async (c) => {
      // Lock against concurrent disable/reset so stale credentials cannot issue a new session.
      const locked = (
        await c.query(
          `SELECT active,password_hash FROM staff_users WHERE id=$1 AND shop_id=$2 FOR UPDATE`,
          [account.id, SHOP_ID],
        )
      ).rows[0];
      if (!locked?.active || locked.password_hash !== account.password_hash)
        throw new UnauthorizedException('Username or password is incorrect.');
      await c.query(
        `DELETE FROM staff_sessions WHERE expires_at<clock_timestamp() OR last_seen_at<clock_timestamp()-interval '30 minutes'`,
      );
      const token = randomBytes(32).toString('hex');
      await c.query(
        `INSERT INTO staff_sessions(token_hash,shop_id,staff_id,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '12 hours')`,
        [digest(token), SHOP_ID, account.id],
      );
      const user = (await this.loadUser(c, account.id))!;
      await this.event(c, user, 'LOGIN', user.id);
      return { token, user, csrfToken: csrfToken(token) };
    }, true);
  }
  async logout(user: CurrentStaff, token: string) {
    await this.db.run(async (c) => {
      await c.query('DELETE FROM staff_sessions WHERE token_hash=$1', [
        digest(token),
      ]);
      await this.event(c, user, 'LOGOUT', user.id);
    }, true);
  }
  async changePassword(
    user: CurrentStaff,
    currentPassword: string,
    password: string,
  ) {
    await this.passwordBudget(user.id);
    const encoded = await this.db.run(
      async (c) =>
        (
          await c.query(
            'SELECT password_hash FROM staff_users WHERE id=$1 AND shop_id=$2',
            [user.id, SHOP_ID],
          )
        ).rows[0].password_hash as string,
    );
    const hash = await this.passwordOperation(async () => {
      if (!(await verifyPassword(currentPassword, encoded)))
        throw new BadRequestException('Current password is incorrect.');
      return hashPassword(password);
    });
    await this.db.run(async (c) => {
      const updated = await c.query(
        'UPDATE staff_users SET password_hash=$1,must_change_password=false WHERE id=$2 AND shop_id=$3 AND active AND password_hash=$4 RETURNING id',
        [hash, user.id, SHOP_ID, encoded],
      );
      if (!updated.rowCount)
        throw new ConflictException('Your account changed. Sign in again.');
      await c.query(
        'DELETE FROM staff_sessions WHERE shop_id=$1 AND staff_id=$2',
        [SHOP_ID, user.id],
      );
      await this.event(c, user, 'PASSWORD_CHANGED', user.id);
    }, true);
    // All devices, including this session, must sign in with the new password.
  }
  async staff() {
    return this.db.run(async (c) =>
      (
        await c.query(
          `SELECT ${columns} FROM staff_users WHERE shop_id=$1 ORDER BY created_at,id`,
          [SHOP_ID],
        )
      ).rows.map((v) => staffSchema.parse(v)),
    );
  }
  async create(
    user: CurrentStaff,
    input: {
      username: string;
      name: string;
      role: StaffRole;
      password: string;
    },
  ) {
    const hash = await this.passwordOperation(() =>
      hashPassword(input.password),
    );
    return this.db.run(async (c) => {
      const id = randomUUID();
      const result = await c.query(
        `INSERT INTO staff_users(id,shop_id,username,name,role,password_hash,must_change_password) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING ${columns}`,
        [id, SHOP_ID, input.username, input.name, input.role, hash],
      );
      await this.event(c, user, 'STAFF_CREATED', id, {
        username: input.username,
        role: input.role,
      });
      return staffSchema.parse(result.rows[0]);
    }, true);
  }
  async update(
    user: CurrentStaff,
    id: string,
    input: { name: string; role: StaffRole; active: boolean },
  ) {
    return this.db.run(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `staff-management:${SHOP_ID}`,
      ]);
      const old = (
        await c.query(
          'SELECT role,active FROM staff_users WHERE id=$1 AND shop_id=$2 FOR UPDATE',
          [id, SHOP_ID],
        )
      ).rows[0];
      if (!old) throw new NotFoundException('Staff account not found.');
      if (id === user.id && (input.role !== 'OWNER' || !input.active))
        throw new ConflictException(
          'You cannot remove your own owner access. Another owner must do this.',
        );
      if (
        old.role === 'OWNER' &&
        old.active &&
        (!input.active || input.role !== 'OWNER')
      ) {
        const owners = await c.query(
          `SELECT id FROM staff_users WHERE shop_id=$1 AND active AND role='OWNER'`,
          [SHOP_ID],
        );
        if (owners.rowCount! <= 1)
          throw new ConflictException('Keep at least one active owner.');
      }
      const result = await c.query(
        `UPDATE staff_users SET name=$1,role=$2,active=$3 WHERE id=$4 AND shop_id=$5 RETURNING ${columns}`,
        [input.name, input.role, input.active, id, SHOP_ID],
      );
      await c.query(
        'DELETE FROM staff_sessions WHERE shop_id=$1 AND staff_id=$2',
        [SHOP_ID, id],
      );
      await this.event(c, user, 'STAFF_UPDATED', id, { ...input });
      return staffSchema.parse(result.rows[0]);
    }, true);
  }
  async reset(user: CurrentStaff, id: string, password: string) {
    const hash = await this.passwordOperation(() => hashPassword(password));
    await this.db.run(async (c) => {
      const result = await c.query(
        'UPDATE staff_users SET password_hash=$1,must_change_password=true WHERE shop_id=$2 AND id=$3 RETURNING id',
        [hash, SHOP_ID, id],
      );
      if (!result.rowCount)
        throw new NotFoundException('Staff account not found.');
      await c.query(
        'DELETE FROM staff_sessions WHERE shop_id=$1 AND staff_id=$2',
        [SHOP_ID, id],
      );
      await this.event(c, user, 'PASSWORD_RESET', id);
    }, true);
  }
  async revoke(user: CurrentStaff, id: string) {
    await this.db.run(async (c) => {
      if (
        !(
          await c.query(
            'SELECT 1 FROM staff_users WHERE shop_id=$1 AND id=$2',
            [SHOP_ID, id],
          )
        ).rowCount
      )
        throw new NotFoundException('Staff account not found.');
      await c.query(
        'DELETE FROM staff_sessions WHERE shop_id=$1 AND staff_id=$2',
        [SHOP_ID, id],
      );
      await this.event(c, user, 'SESSIONS_REVOKED', id);
    }, true);
  }
  async audit(page: number) {
    return this.db.run(async (c) => ({
      items: (
        await c.query(
          `SELECT id::text,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "occurredAt",actor_name AS "actorName",actor_username AS "actorUsername",action,resource,record_id AS "recordId",details FROM audit_events WHERE shop_id=$1 ORDER BY id DESC LIMIT 50 OFFSET $2`,
          [SHOP_ID, (page - 1) * 50],
        )
      ).rows,
      page,
      total: (
        await c.query(
          'SELECT count(*)::int AS n FROM audit_events WHERE shop_id=$1',
          [SHOP_ID],
        )
      ).rows[0].n,
    }));
  }
  async recovery() {
    return this.db.run(async (c) => ({
      backups: (
        await c.query(
          `SELECT id,file_name AS "fileName",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",size_bytes::text AS "sizeBytes",sha256,to_char(verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "verifiedAt",table_count AS "tableCount" FROM backup_runs ORDER BY created_at DESC LIMIT 10`,
        )
      ).rows,
    }));
  }
}
