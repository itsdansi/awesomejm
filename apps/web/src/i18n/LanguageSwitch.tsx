import { setLanguage, useLanguage } from './language';
export function LanguageSwitch() {
  const language = useLanguage();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label={language === 'ne' ? 'भाषा छान्नुहोस्' : 'Choose language'}
    >
      <button
        type="button"
        lang="en"
        aria-pressed={language === 'en'}
        onClick={() => setLanguage('en')}
      >
        English
      </button>
      <button
        type="button"
        lang="ne"
        aria-pressed={language === 'ne'}
        onClick={() => setLanguage('ne')}
      >
        नेपाली
      </button>
    </div>
  );
}
