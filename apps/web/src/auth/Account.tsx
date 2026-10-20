import { t, useLanguage } from '../i18n/language';
import { AppShell } from '../shared/AppShell';
import { useAuth } from './AuthContext';
import { PasswordForm } from './PasswordForm';
export function Account() {
  useLanguage();

  const { user, refresh } = useAuth();
  return (
    <AppShell section="Account">
      <p className="eyebrow">{t('YOUR ACCESS')}</p>
      <h1>{t('Your account.')}</h1>
      <p>
        {user.name} · {user.username} · {t(user.role)}
      </p>
      <section className="panel account-panel">
        <h2>{t('Change password')}</h2>
        <PasswordForm onChanged={() => void refresh()} />
      </section>
    </AppShell>
  );
}
