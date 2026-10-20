import { t, message, useLanguage } from '../i18n/language';
import { useState, type FormEvent } from 'react';
import { changePasswordSchema } from '@awesomejm/contracts';
import { errorMessage, request } from '../shared/api';
export function PasswordForm({ onChanged }: { onChanged: () => void }) {
  useLanguage();

  const [currentPassword, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      password,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('\n'));
      return;
    }
    if (password !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await request(
        '/auth/password',
        { parse: (v) => v },
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      setCurrent('');
      setPassword('');
      setConfirmation('');
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="access-form" onSubmit={(e) => void submit(e)}>
      {error && (
        <p className="error-banner" role="alert">
          {message(error)}
        </p>
      )}
      <label>
        {t('auth.fields.currentPassword')}
        <input
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label>
        {t('auth.passwordForm.newPassword')}
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={15}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <small>
          {t('auth.passwordForm.use15128CharactersALongUniquePassphrase')}
        </small>
      </label>
      <label>
        {t('auth.passwordForm.confirmNewPassword')}
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </label>
      <p>{t('auth.passwordForm.changingYourPasswordSignsYouOutOnEvery')}</p>
      <button className="button primary" disabled={busy}>
        {busy
          ? t('auth.passwordForm.updating')
          : t('auth.passwordForm.changePasswordAndSignOut')}
      </button>
    </form>
  );
}
