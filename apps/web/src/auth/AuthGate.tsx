import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { t, message, useLanguage } from '../i18n/language';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { sessionSchema, type CurrentStaff } from '@awesomejm/contracts';
import { request, errorMessage } from '../shared/api';
import { AuthContext } from './AuthContext';
import { setSessionCsrf } from './session';
import { Icon } from '../shared/ui';
import { PasswordForm } from './PasswordForm';
export function AuthGate({ children }: { children: ReactNode }) {
  useLanguage();

  const [user, setUser] = useState<CurrentStaff | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const refresh = useCallback(
    () =>
      request('/auth/session', sessionSchema)
        .then((session) => {
          setSessionCsrf(session.csrfToken);
          setUser(session.user);
          setError('');
        })
        .catch((e) => {
          setError(errorMessage(e));
        })
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => {
    void refresh();
    const expired = () => {
      setUser(null);
      setSessionCsrf(null);
    };
    globalThis.addEventListener('session-expired', expired);
    const focused = () => void refresh();
    globalThis.addEventListener('focus', focused);
    const interval = globalThis.setInterval(() => void refresh(), 60000);
    return () => {
      globalThis.removeEventListener('session-expired', expired);
      globalThis.removeEventListener('focus', focused);
      globalThis.clearInterval(interval);
    };
  }, [refresh]);
  async function logout() {
    try {
      await request(
        '/auth/logout',
        { parse: (v) => v },
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      setUser(null);
      setSessionCsrf(null);
      setError('');
    } catch (e) {
      setError(`Sign-out could not be confirmed. ${errorMessage(e)}`);
    }
  }
  if (loading)
    return (
      <div className="app-loading" role="status">
        {t('auth.signIn.checkingYourSession')}
      </div>
    );
  if (!user)
    return (
      <Login
        error={error}
        onLogin={(session) => {
          setUser(session.user);
          setSessionCsrf(session.csrfToken);
        }}
      />
    );
  return (
    <AuthContext.Provider value={{ user, refresh, logout }}>
      {error && (
        <p className="session-error" role="alert">
          {message(error)}
        </p>
      )}
      {user.mustChangePassword ? (
        <div className="auth-page">
          <div className="auth-language">
            <LanguageSwitch />
          </div>
          <section className="auth-card">
            <p className="eyebrow">
              {t('auth.signIn.welcome') + ' '}
              {user.name}
            </p>
            <h1>{t('auth.signIn.makeThisAccountYours')}</h1>
            <p>{t('auth.signIn.passwordChangeHelp')}</p>
            <PasswordForm
              onChanged={() => {
                setUser(null);
                setSessionCsrf(null);
              }}
            />
            <button className="text-button" onClick={() => void logout()}>
              {t('common.actions.signOut')}
            </button>
          </section>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
function Login({
  error: connectionError,
  onLogin,
}: {
  error: string;
  onLogin: (session: {
    user: CurrentStaff | null;
    csrfToken: string | null;
  }) => void;
}) {
  useLanguage();

  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(
        await request('/auth/login', sessionSchema, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        }),
      );
      setPassword('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-language">
        <LanguageSwitch />
      </div>
      <section className="auth-card">
        <span className="brand-mark">
          <Icon name="diamond" size={30} />
        </span>
        <p className="eyebrow">{t('auth.signIn.awesomejmJewelleryManager')}</p>
        <h1>
          {t('auth.signIn.yourShop')}
          <br />
          {t('auth.signIn.yourWorkspace')}
        </h1>
        <p>{t('auth.signIn.signInWithYourStaffAccountToContinue')}</p>
        {(error || connectionError) && (
          <p className="error-banner" role="alert">
            {message(error) || message(connectionError)}
          </p>
        )}
        <form className="access-form" onSubmit={(e) => void submit(e)}>
          <label>
            {t('auth.fields.username')}
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength={64}
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <label>
            {t('auth.fields.password')}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={128}
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? t('auth.signIn.signingIn') : t('auth.signIn.title')}
            <Icon name="arrow" />
          </button>
        </form>
        <p className="auth-help">
          {t('auth.signIn.firstTimeSetupAndOwnerRecoveryAreHandled')}
        </p>
      </section>
      <div className="auth-note">
        <span>◇</span>
        <h2>{t('common.labels.careInEveryDetail')}</h2>
        <p>{t('common.labels.forGoldAndSilverBusinesses')}</p>
        <small>
          {t('auth.signIn.individualAccessAClearRecordOfEveryChange')}
        </small>
      </div>
    </div>
  );
}
