import { t, useLanguage } from './language';
export function AppLoading() {
  useLanguage();
  return (
    <div className="app-loading" role="status">
      {t('Loading workspace…')}
    </div>
  );
}
