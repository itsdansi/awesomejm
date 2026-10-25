import { t, useLanguage } from './language';
export function AppLoading({
  withinWorkspace = false,
}: {
  withinWorkspace?: boolean;
}) {
  useLanguage();
  return (
    <div
      className={withinWorkspace ? 'workspace-loading' : 'app-loading'}
      role="status"
    >
      {t('common.feedback.loadingWorkspace')}
    </div>
  );
}
