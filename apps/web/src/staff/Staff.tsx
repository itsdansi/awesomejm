import { TimeValue } from '../settings/DateValue';
import { Pagination } from '../shared/Pagination';
import type { StaticTranslationKey } from '../i18n/schema';
import { roleKeys } from '../i18n/labels';
import { t, message, useLanguage } from '../i18n/language';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
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
import { Dialog } from '../shared/ui';
import { errorMessage, request } from '../shared/api';
const roles = ['OWNER', 'MANAGER', 'CASHIER', 'VIEWER'] as const;
const roleDescriptions: Record<StaffRole, StaticTranslationKey> = {
  OWNER: 'staff.roles.ownerDescription',
  MANAGER: 'staff.roles.managerDescription',
  CASHIER: 'staff.roles.cashierDescription',
  VIEWER: 'staff.roles.viewerDescription',
};
const actions: Partial<Record<string, StaticTranslationKey>> = {
  INSERT: 'staff.access.recordAdded',
  UPDATE: 'staff.access.recordChanged',
  DISPLAY_SETTINGS_UPDATED: 'settings.updated',
  LOGIN: 'staff.access.signedIn',
  LOGOUT: 'staff.access.signedOut',
  LOGIN_FAILED: 'staff.access.signInFailed',
  STAFF_CREATED: 'staff.access.staffAccountCreated',
  STAFF_UPDATED: 'staff.access.staffAccessUpdated',
  PASSWORD_CHANGED: 'staff.access.passwordChanged',
  PASSWORD_RESET: 'staff.access.temporaryPasswordSet',
  OPERATOR_PASSWORD_RESET: 'staff.access.operatorPasswordRecovery',
  OWNER_BOOTSTRAPPED: 'staff.access.initialOwnerSetup',
  SESSIONS_REVOKED: 'staff.access.devicesSignedOut',
};
const resources: Partial<Record<string, StaticTranslationKey>> = {
  inventory_items: 'staff.access.jewelleryStock',
  inventory_movements: 'staff.access.stockMovement',
  metal_rates: 'staff.access.metalRate',
  customers: 'common.labels.customer',
  customer_profile_history: 'staff.access.customerProfileHistory',
  customer_account_entries: 'common.labels.customerAccountEntry',
  sales: 'common.labels.sale',
  sale_lines: 'staff.access.saleLine',
  sale_cancellations: 'staff.access.saleCorrection',
  custom_orders: 'staff.access.customOrder',
  custom_order_events: 'common.labels.orderProgress',
  metal_purchases: 'common.labels.oldMetalPurchase',
  old_metal_lots: 'staff.access.oldMetalLot',
  purchase_cancellations: 'staff.access.purchaseCorrection',
  old_metal_movements: 'staff.access.oldMetalMovement',
  staff: 'staff.access.staffAccount',
  shop: 'settings.title',
};
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
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const loading = loadedPage !== page;
  const loadRequest = useRef(0);
  const load = useCallback(() => {
    const requestId = ++loadRequest.current;
    return Promise.all([
      request('/auth/staff', staffListSchema),
      request(`/auth/audit?page=${page}`, auditListSchema),
      request('/auth/recovery', recoveryStatusSchema),
    ])
      .then(([s, a, r]) => {
        if (requestId !== loadRequest.current) return;
        setStaff(s);
        setAudit(a);
        setRecovery(r);
        setError('');
      })
      .catch((e) => {
        if (requestId === loadRequest.current) {
          setAudit(null);
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (requestId === loadRequest.current) setLoadedPage(page);
      });
  }, [page]);
  useEffect(() => {
    void load();
    return () => {
      loadRequest.current += 1;
    };
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
    <>
      <div className="page-heading">
        <div>
          <h1>{t('staff.access.peopleYouTrust')}</h1>
        </div>
        <button className="button primary" onClick={() => setEdit('new')}>
          {t('staff.access.addStaffMember')}
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
          <h2>{t('staff.access.staffAccess')}</h2>
          <button className="text-button" onClick={() => void load()}>
            {t('common.actions.refresh')}
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('staff.access.staffMember')}</th>
                <th>{t('staff.access.role')}</th>
                <th>{t('staff.access.access')}</th>
                <th>{t('common.labels.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <small className="cell-subtitle">
                      {member.username}
                      {member.id === user.id ? ' ' + t('staff.access.you') : ''}
                    </small>
                  </td>
                  <td>{t(roleKeys[member.role])}</td>
                  <td>
                    {member.active
                      ? t('common.labels.active')
                      : t('staff.access.disabled')}
                    {member.mustChangePassword && (
                      <small className="cell-subtitle">
                        {t('staff.access.personalPasswordRequired')}
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="staff-actions">
                      <button
                        className="text-button"
                        onClick={() => setEdit(member)}
                      >
                        {t('staff.access.editAccess')}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setReset(member)}
                      >
                        {t('staff.access.resetPassword')}
                      </button>
                      <button
                        className="text-button"
                        disabled={busy || member.id === user.id}
                        onClick={() => void revoke(member)}
                      >
                        {t('staff.access.signOutDevices')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="section-note">{t('staff.access.permissionSummary')}</p>
      </section>
      <section className="panel recovery-panel">
        <div className="panel-heading">
          <div>
            <h2>{t('staff.access.backupsThatHaveBeenRestored')}</h2>
          </div>
        </div>
        <p>{t('staff.access.encryptedBackupsAreCreatedByTheServerOperator')}</p>
        {recovery?.backups.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('staff.access.archive')}</th>
                  <th>{t('settings.created')}</th>
                  <th>{t('staff.access.restoreVerified')}</th>
                  <th>{t('staff.access.tablesChecked')}</th>
                </tr>
              </thead>
              <tbody>
                {recovery.backups.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.fileName}
                      <small className="cell-subtitle">
                        {(Number(b.sizeBytes) / 1024).toFixed(1)}{' '}
                        {' ' + t('staff.access.kbSha256')}{' '}
                        {b.sha256.slice(0, 12)}…
                      </small>
                    </td>
                    <td>
                      <TimeValue value={b.createdAt} />
                    </td>
                    <td>
                      {b.verifiedAt ? (
                        <TimeValue value={b.verifiedAt} />
                      ) : (
                        t('staff.access.notVerified')
                      )}
                    </td>
                    <td>{b.tableCount ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h3>{t('staff.access.noBackupHasBeenRecordedYet')}</h3>
            <p>{t('staff.recovery.setupHelp')}</p>
          </div>
        )}
        <p className="section-note">
          {t('staff.access.keepAnEncryptedCopyOffTheApplicationServer')}
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>{t('staff.access.auditTrail')}</h2>
          <span>{t('settings.latestChanges')}</span>
        </div>
        <div className="table-scroll" aria-busy={loading}>
          <table>
            <thead>
              <tr>
                <th>{t('staff.access.when')}</th>
                <th>{t('staff.access.staffMember')}</th>
                <th>{t('staff.access.action')}</th>
                <th>{t('staff.access.record')}</th>
              </tr>
            </thead>
            <tbody>
              {audit?.items.map((event) => (
                <tr key={event.id}>
                  <td>
                    <TimeValue value={event.occurredAt} />
                  </td>
                  <td>
                    {event.actorName ??
                      t('staff.access.serverOperatorLegacyImport')}
                    <small className="cell-subtitle">
                      {event.actorUsername}
                    </small>
                  </td>
                  <td>
                    {actions[event.action]
                      ? t(actions[event.action])
                      : event.action}
                  </td>
                  <td>
                    {resources[event.resource]
                      ? t(resources[event.resource])
                      : event.resource}
                    <small className="cell-subtitle">
                      {event.recordId ?? '—'}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            {audit?.total ?? '—'} {t('staff.access.events')}
          </span>
          <Pagination
            page={page}
            pageSize={50}
            total={audit?.total}
            loading={loading || busy}
            onPageChange={setPage}
          />
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
    </>
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
      title={
        existing
          ? t('staff.access.editStaffAccess')
          : t('staff.access.addStaffMember')
      }
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
          {t('staff.access.name')}
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {t('auth.fields.username')}
          <input
            required
            disabled={!!existing}
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          {t('staff.access.role')}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
          >
            {roles.map((r) => (
              <option value={r} key={r}>
                {t(roleKeys[r])}
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
            {t('staff.access.allowSignIn')}
          </label>
        ) : (
          <label>
            {t('staff.access.temporaryPassword')}
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
              {t('staff.access.shareSecurelyWithThisStaffMemberTheyMust')}
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
            {t('common.actions.cancel')}
          </button>
          <button className="button primary" disabled={busy}>
            {busy
              ? t('common.actions.saving')
              : t('staff.access.saveStaffAccess')}
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
      title={t('staff.access.resetPasswordFor', { name: member.name })}
      onClose={onClose}
      busy={busy}
    >
      <form className="access-form" onSubmit={(e) => void submit(e)}>
        {error && (
          <p role="alert" className="error-banner">
            {message(error)}
          </p>
        )}
        <p>{t('staff.access.thisSignsTheStaffMemberOutEverywhereThey')}</p>
        <label>
          {t('staff.access.temporaryPassword')}
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
          {busy ? t('staff.access.resetting') : t('staff.access.resetPassword')}
        </button>
      </form>
    </Dialog>
  );
}
