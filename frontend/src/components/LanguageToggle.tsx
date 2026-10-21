import { useLanguage } from '../lib/language-context';
import { LanguageSwitch } from './Switch';

export function LanguageToggle() {
  const { lang, toggleLang } = useLanguage();
  const label = lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية';
  return (
    <button type="button" onClick={toggleLang} className="switch-btn" title={label} aria-label={label}>
      <LanguageSwitch />
    </button>
  );
}
