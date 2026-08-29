import { useLanguage } from '../lib/language-context';

export function LanguageToggle({ floating = false }: { floating?: boolean }) {
  const { lang, toggleLang, t } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggleLang}
      className="btn btn-sm"
      title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      style={
        floating
          ? { background: 'var(--white)', color: 'var(--maroon)', border: '2px solid var(--maroon)' }
          : { background: 'rgba(255,255,255,0.15)', color: 'white', flexShrink: 0 }
      }
    >
      🌐 {t('common.language')}
    </button>
  );
}
