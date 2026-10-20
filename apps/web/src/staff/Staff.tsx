import { locale, t, message, useLanguage } from '../i18n/language';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  staffListSchema,
  type AuditList,
  type RecoveryStatus,
  staffSchema,
  createStaffSchema,
  updateStaffSchema,
  resetPasswordSchema,
  auditListSchema,
  recoveryStatusSchema,
  type Staff as StaffUser,
  type StaffRole,
} from '@awesomejm/contracts';
import { useAuth } from '../auth/AuthContext';
import { AppShell } from '../shared/AppShell';
import { Dialog } from '../shared/ui';
import { errorMessage, request } from '../shared/api';
const roles = ['OWNER', 'MANAGER', 'CASHIER', 'VIEWER'] as const;
const roleDescriptions: Record<StaffRole, string> = {
  OWNER: 'Full shop access, staff administration and recovery status.',
  MANAGER:
    'All shop operations, including metal purchases, opening balances, refunds and corrections.',
  CASHIER:
    'Customers, incoming payments, sales and orders. Read access to shop records and reports.',
  VIEWER:
    'Read shop records and reports. Cannot create or change transactions.',
};
const actions: Record<string, string> = {
  INSERT: 'Record added',
  UPDATE: 'Record changed',
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  LOGIN_FAILED: 'Sign-in failed',
  STAFF_CREATED: 'Staff account created',
  STAFF_UPDATED: 'Staff access updated',
  PASSWORD_CHANGED: 'Password changed',
  PASSWORD_RESET: 'Temporary password set',
  OPERATOR_PASSWORD_RESET: 'Operator password recovery',
  OWNER_BOOTSTRAPPED: 'Initial owner setup',
  SESSIONS_REVOKED: 'Devices signed out',
};
const resources: Record<string, string> = {
  inventory_items: 'Jewellery stock',
  inventory_movements: 'Stock movement',
  metal_rates: 'Metal rate',
  customers: 'Customer',
  customer_profile_history: 'Customer profile history',
  customer_account_entries: 'Customer account entry',
  sales: 'Sale',
  sale_lines: 'Sale line',
  sale_cancellations: 'Sale correction',
  custom_orders: 'Custom order',
  custom_order_events: 'Order progress',
  metal_purchases: 'Old-metal purchase',
  old_metal_lots: 'Old-metal lot',
  purchase_cancellations: 'Purchase correction',
  old_metal_movements: 'Old-metal movement',
  staff: 'Staff account',
};
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(locale(), { timeZone: 'Asia/Kathmandu' })
    : t('Not verified');
export function Staff() {
  useLanguage();

  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffUser[]>([]),
    [audit, setAudit] = useState<AuditList | null>(null),
    [recovery, setRecovery] = useState<RecoveryStatus | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [edit, setEdit] = useState<StaffUser | 'new' | null>(null),
    [reset, setReset] = useState<StaffUser | null>(null),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      Promise.all([
        request('/auth/staff', staffListSchema),
        request(`/auth/audit?page=${page}`, auditListSchema),
        request('/auth/recovery', recoveryStatusSchema),
      ])
        .then(([s, a, r]) => {
          setStaff(s);
          setAudit(a);
          setRecovery(r);
          setError('');
        })
        .catch((e) => setError(errorMessage(e))),
    [page],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function revoke(member: StaffUser) {
    setBusy(true);
    try {
      await request(
        `/auth/staff/${member.id}/revoke-sessions`,
        { parse: (v) => v },
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      setNotice(`Signed ${member.name} out on all devices.`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell section="Staff & recovery">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('ACCESS & CONTINUITY')}</p>
          <h1>{t('People you trust.')}</h1>
          <p>
            {t(
              'Individual staff accounts, a clear audit trail and verified recovery.',
            )}
          </p>
        </div>
        <button className="button primary" onClick={() => setEdit('new')}>
          {t('Add staff member')}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {message(error)}
        </p>
      )}
      {notice && (
        <p role="status" className="success-banner">
          {message(notice)}
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>{t('Staff access')}</h2>
          <button className="text-button" onClick={() => void load()}>
            {t('Refresh')}
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('Staff member')}</th>
                <th>{t('Role')}</th>
                <th>{t('Access')}</th>
                <th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <small className="cell-subtitle">
                      {member.username}
                      {member.id === user.id ? t(' · You') : ''}
                    </small>
                  </td>
                  <td>{t(member.role)}</td>
                  <td>
                    {member.active ? t('Active') : t('Disabled')}
                    {member.mustChangePassword && (
                      <small className="cell-subtitle">
                        {t('Personal password required')}
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="staff-actions">
                      <button
                        className="text-button"
                        onClick={() => setEdit(member)}
                      >
                        {t('Edit access')}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setReset(member)}
                      >
                        {t('Reset password')}
                      </button>
                      <button
                        className="text-button"
                        disabled={busy || member.id === user.id}
                        onClick={() => void revoke(member)}
                      >
                        {t('Sign out devices')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="section-note">
          {t(
            'Owner: all access and staff administration. Manager: all shop operations and corrections. Cashier: customers, sales, orders and incoming payments. Viewer: read-only. All roles can view shop records and reports. Opening balances, refunds and corrections require Manager or Owner.',
          )}
        </p>
      </section>
      <section className="panel recovery-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t('RECOVERY CHECKPOINT')}</p>
            <h2>{t('Backups that have been restored.')}</h2>
          </div>
        </div>
        <p>
          {t(
            'Encrypted backups are created by the server operator. Verification restores the archive into a separate database and compares every table against the backup snapshot.',
          )}
        </p>
        {recovery?.backups.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('Archive')}</th>
                  <th>{t('Created · Nepal time')}</th>
                  <th>{t('Restore verified')}</th>
                  <th>{t('Tables checked')}</th>
                </tr>
              </thead>
              <tbody>
                {recovery.backups.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.fileName}
                      <small className="cell-subtitle">
                        {(Number(b.sizeBytes) / 1024).toFixed(1)}{' '}
                        {t(' KB · SHA256')} {b.sha256.slice(0, 12)}…
                      </small>
                    </td>
                    <td>{time(b.createdAt)}</td>
                    <td>{time(b.verifiedAt)}</td>
                    <td>{b.tableCount ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h3>{t('No backup has been recorded yet')}</h3>
            <p>
              {t(
                'Ask your server administrator to configure the backup key, daily backups and regular restore verification before rollout.',
              )}
            </p>
          </div>
        )}
        <p className="section-note">
          {t(
            'Keep an encrypted copy off the application server and the recovery key in a separate secure location. A local archive alone does not protect against losing the server.',
          )}
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>{t('Audit trail')}</h2>
          <span>{t('Latest changes · Nepal time')}</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('When')}</th>
                <th>{t('Staff member')}</th>
                <th>{t('Action')}</th>
                <th>{t('Record')}</th>
              </tr>
            </thead>
            <tbody>
              {audit?.items.map((event) => (
                <tr key={event.id}>
                  <td>{time(event.occurredAt)}</td>
                  <td>
                    {event.actorName ?? t('Server operator / legacy import')}
                    <small className="cell-subtitle">
                      {event.actorUsername}
                    </small>
                  </td>
                  <td>{t(actions[event.action] ?? event.action)}</td>
                  <td>
                    {t(resources[event.resource] ?? event.resource)}
                    <small className="cell-subtitle">
                      {event.recordId ?? '—'}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <button
            className="button secondary"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('Previous')}
          </button>
          <span>
            {t('Page ')}
            {page} · {audit?.total ?? 0} {t(' events')}
          </span>
          <button
            className="button secondary"
            disabled={!audit || page * 50 >= audit.total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('Next')}
          </button>
        </div>
      </section>
      {edit && (
        <StaffForm
          member={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            setNotice(
              'Staff access saved. Existing sessions for edited accounts were revoked.',
            );
            void load();
          }}
        />
      )}
      {reset && (
        <ResetForm
          member={reset}
          onClose={() => setReset(null)}
          onSaved={() => {
            setReset(null);
            setNotice('Temporary password saved. All devices were signed out.');
            void load();
          }}
        />
      )}
    </AppShell>
  );
}
function StaffForm({
  member,
  onClose,
  onSaved,
}: {
  member: StaffUser | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  useLanguage();

  const existing = member === 'new' ? null : member;
  const [name, setName] = useState(existing?.name ?? ''),
    [username, setUsername] = useState(existing?.username ?? ''),
    [role, setRole] = useState<StaffRole>(existing?.role ?? 'CASHIER'),
    [active, setActive] = useState(existing?.active ?? true),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = existing
      ? updateStaffSchema.safeParse({ name, role, active })
      : createStaffSchema.safeParse({ name, username, role, password });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('\n'));
      return;
    }
    setBusy(true);
    try {
      await request(
        existing ? `/auth/staff/${existing.id}` : '/auth/staff',
        staffSchema,
        {
          method: existing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      setPassword('');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={existing ? t('Edit staff access') : t('Add staff member')}
      eyebrow={t('Staff administration')}
      onClose={onClose}
      busy={busy}
    >
      <form className="access-form" onSubmit={(e) => void submit(e)}>
        {error && (
          <p role="alert" className="error-banner">
            {message(error)}
          </p>
        )}
        <label>
          {t('Name')}
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {t('Username')}
          <input
            required
            disabled={!!existing}
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          {t('Role')}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
          >
            {roles.map((r) => (
              <option value={r} key={r}>
                {t(r)}
              </option>
            ))}
          </select>
        </label>
        <p className="section-note">{t(roleDescriptions[role])}</p>
        {existing ? (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            {t('Allow sign-in')}
          </label>
        ) : (
          <label>
            {t('Temporary password')}
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>
              {t(
                'Share securely with this staff member. They must replace it at first sign-in.',
              )}
            </small>
          </label>
        )}
        <div className="form-actions">
          <button
            className="button secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            {t('Cancel')}
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? t('Saving…') : t('Save staff access')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function ResetForm({
  member,
  onClose,
  onSaved,
}: {
  member: StaffUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  useLanguage();

  const [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('\n'));
      return;
    }
    setBusy(true);
    try {
      await request(
        `/auth/staff/${member.id}/reset-password`,
        { parse: (v) => v },
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      setPassword('');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={t('Reset password · {value0}', { value0: member.name })}
      onClose={onClose}
      busy={busy}
      eyebrow={t('Staff recovery')}
    >
      <form className="access-form" onSubmit={(e) => void submit(e)}>
        {error && (
          <p role="alert" className="error-banner">
            {message(error)}
          </p>
        )}
        <p>
          {t(
            'This signs the staff member out everywhere. They must change this temporary password at next sign-in.',
          )}
        </p>
        <label>
          {t('Temporary password')}
          <input
            type="password"
            required
            minLength={15}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? t('Resetting…') : t('Reset password')}
        </button>
      </form>
    </Dialog>
  );
}
