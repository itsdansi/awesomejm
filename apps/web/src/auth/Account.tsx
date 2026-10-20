import { AppShell } from '../shared/AppShell';
import { useAuth } from './AuthContext';
import { PasswordForm } from './PasswordForm';
export function Account() {
  const { user, refresh } = useAuth();
  return (
    <AppShell section="Account">
      <p className="eyebrow">YOUR ACCESS</p>
      <h1>Your account.</h1>
      <p>
        {user.name} · {user.username} · {user.role}
      </p>
      <section className="panel account-panel">
        <h2>Change password</h2>
        <PasswordForm onChanged={() => void refresh()} />
      </section>
    </AppShell>
  );
}
