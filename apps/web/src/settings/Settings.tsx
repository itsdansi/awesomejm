import { useState, type FormEvent } from 'react';
import {
  displaySettingsSchema,
  type DisplaySettings,
} from '@awesomejm/contracts';
import { useAuth } from '../auth/AuthContext';
import { message, t, useLanguage } from '../i18n/language';
import { request, errorMessage } from '../shared/api';
import { displayTime } from './dates.mjs';

export function Settings() {
  useLanguage();
  const { user } = useAuth();
  const [notice, setNotice] = useState(false);
  return (
    <>
      <h1>{t('settings.title')}</h1>
      {notice && (
        <p className="notice" role="status">
          {t('settings.saved')}
        </p>
      )}
      <SettingsForm
        onSaved={() => setNotice(true)}
        onEdit={() => setNotice(false)}
        key={JSON.stringify(user.displaySettings)}
        saved={user.displaySettings}
      />
    </>
  );
}
function SettingsForm({
  saved,
  onSaved,
  onEdit,
}: {
  saved: DisplaySettings;
  onSaved: () => void;
  onEdit: () => void;
}) {
  const language = useLanguage();
  const { can, refresh } = useAuth();
  const editable = can('settings.manage');
  const [fields, setFields] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewInstant] = useState(() => new Date().toISOString());
  const zones = [
    ...new Set([
      'Asia/Kathmandu',
      'UTC',
      saved.timeZone,
      ...Intl.supportedValuesOf('timeZone'),
    ]),
  ].sort();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    onEdit();
    try {
      await request('/auth/shop-settings', displaySettingsSchema, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      onSaved();
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel">
      <h2>{t('settings.dateAndTime')}</h2>
      <p>{t('settings.shopWide')}</p>
      {!editable && <p className="settings-help">{t('settings.ownerOnly')}</p>}
      {error && (
        <p className="error-banner" role="alert">
          {message(error)}
        </p>
      )}
      <form className="access-form" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy || !editable}>
          <label>
            {t('settings.calendar')}
            <select
              value={fields.calendar}
              onChange={(e) => {
                onEdit();
                setFields({
                  ...fields,
                  calendar: e.target.value as DisplaySettings['calendar'],
                });
              }}
            >
              <option value="AD">{t('settings.calendars.ad')}</option>
              <option value="BS">{t('settings.calendars.bs')}</option>
            </select>
          </label>
          <label>
            {t('settings.timeZone')}
            <select
              value={fields.timeZone}
              onChange={(e) => {
                onEdit();
                setFields({ ...fields, timeZone: e.target.value });
              }}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('settings.timeFormat')}
            <select
              value={fields.hourCycle}
              onChange={(e) => {
                onEdit();
                setFields({
                  ...fields,
                  hourCycle: e.target.value as DisplaySettings['hourCycle'],
                });
              }}
            >
              <option value="h23">{t('settings.hours.h23')}</option>
              <option value="h12">{t('settings.hours.h12')}</option>
            </select>
          </label>
        </fieldset>
        <div className="settings-preview">
          <span>{t('settings.preview')}</span>
          <output>{displayTime(previewInstant, fields, language)}</output>
        </div>
        <p className="settings-help">{t('settings.dateEntryHelp')}</p>
        {fields.calendar === 'BS' && (
          <p className="settings-help">{t('settings.bsRangeHelp')}</p>
        )}
        {editable && (
          <button
            className="button primary"
            disabled={busy || JSON.stringify(fields) === JSON.stringify(saved)}
          >
            {busy ? t('settings.saving') : t('settings.save')}
          </button>
        )}
      </form>
    </section>
  );
}
