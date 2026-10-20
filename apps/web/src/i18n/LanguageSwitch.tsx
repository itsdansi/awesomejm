import { setLanguage, useLanguage, t } from './language';
export function LanguageSwitch() {
  const language = useLanguage();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label={t('common.language.choose')}
    >
      <button
        type="button"
        lang="en"
        aria-pressed={language === 'en'}
        onClick={() => setLanguage('en')}
      >
        {t('common.language.english')}
      </button>
      <button
        type="button"
        lang="ne"
        aria-pressed={language === 'ne'}
        onClick={() => setLanguage('ne')}
      >
        {t('common.language.nepali')}
      </button>
    </div>
  );
}
