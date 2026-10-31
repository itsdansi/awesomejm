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
import { authCopy } from './authCopy';
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
            <p>{user.name}</p>
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
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark-badge">
            <Icon name="diamond" size={26} />
          </span>
          <div className="auth-brand-titles">
            <strong className="auth-brand-name">{authCopy.brand}</strong>
            <span className="auth-brand-tag">{authCopy.brandSubtitle}</span>
          </div>
        </div>
        <h1 className="auth-subhead">{authCopy.subhead}</h1>
        {(error || connectionError) && (
          <p className="error-banner" role="alert">
            {message(error) || message(connectionError)}
          </p>
        )}
        <form className="access-form" onSubmit={(e) => void submit(e)}>
          <label>
            {authCopy.usernameLabel}
            <input
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength={64}
              autoCapitalize="none"
              spellCheck={false}
              placeholder={authCopy.usernameLabel}
            />
          </label>
          <label>
            {authCopy.passwordLabel}
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={128}
              placeholder="••••••••••••"
            />
          </label>
          <button className="button primary" disabled={busy}>
            <span>
              {busy ? authCopy.signingInButton : authCopy.signInButton}
            </span>
            <Icon name="arrow" />
          </button>
        </form>
      </section>
      <div className="auth-note">
        <span className="auth-note-icon">◇</span>
        <h2>{authCopy.slogan}</h2>
        <p className="auth-tagline-ne">{authCopy.tagline}</p>
        <div className="auth-pillars">
          <span>{authCopy.pillars.purity}</span>
          <span className="auth-bullet">◆</span>
          <span>{authCopy.pillars.trust}</span>
          <span className="auth-bullet">◆</span>
          <span>{authCopy.pillars.security}</span>
        </div>
        <small className="auth-audit-en">{authCopy.auditNote}</small>
      </div>
    </div>
  );
}
