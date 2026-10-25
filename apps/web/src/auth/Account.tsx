import { roleKeys } from '../i18n/labels';
import { t, useLanguage } from '../i18n/language';
import { useAuth } from './AuthContext';
import { PasswordForm } from './PasswordForm';
export function Account() {
  useLanguage();

  const { user, refresh } = useAuth();
  return (
    <>
      <h1>{t('auth.account.yourAccount')}</h1>
      <p>
        {user.name} · {user.username} · {t(roleKeys[user.role])}
      </p>
      <section className="panel account-panel">
        <h2>{t('auth.account.changePassword')}</h2>
        <PasswordForm onChanged={() => void refresh()} />
      </section>
    </>
  );
}
