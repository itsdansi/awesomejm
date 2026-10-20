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
    const interval = globalThis.setInterval(() => void refresh(), 60000);
    return () => {
      globalThis.removeEventListener('session-expired', expired);
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
        Checking your session…
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
          {error}
        </p>
      )}
      {user.mustChangePassword ? (
        <div className="auth-page">
          <section className="auth-card">
            <p className="eyebrow">Welcome, {user.name}</p>
            <h1>Make this account yours.</h1>
            <p>Choose a personal password before opening the workspace.</p>
            <PasswordForm
              onChanged={() => {
                setUser(null);
                setSessionCsrf(null);
              }}
            />
            <button className="text-button" onClick={() => void logout()}>
              Sign out
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
        <span className="brand-mark">
          <Icon name="diamond" size={30} />
        </span>
        <p className="eyebrow">AWESOMEJM · JEWELLERY MANAGER</p>
        <h1>
          Your shop.
          <br />
          Your workspace.
        </h1>
        <p>Sign in with your staff account to continue.</p>
        {(error || connectionError) && (
          <p className="error-banner" role="alert">
            {error || connectionError}
          </p>
        )}
        <form className="access-form" onSubmit={(e) => void submit(e)}>
          <label>
            Username
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
            Password
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
            {busy ? 'Signing in…' : 'Sign in'}
            <Icon name="arrow" />
          </button>
        </form>
        <p className="auth-help">
          First-time setup and owner recovery are handled by your server
          administrator. Ask the shop owner if you need a staff account.
        </p>
      </section>
      <div className="auth-note">
        <span>◇</span>
        <h2>Care in every detail.</h2>
        <p>सुनचाँदी व्यवसायको लागि</p>
        <small>Individual access. A clear record of every change.</small>
      </div>
    </div>
  );
}
