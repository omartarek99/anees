import { useTheme } from '../lib/theme-context';
import { useLanguage } from '../lib/language-context';

export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const label = theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark');
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={floating ? 'btn btn-sm btn-float' : 'btn btn-sm'}
      title={label}
      aria-label={label}
      style={floating ? undefined : { background: 'rgba(255,255,255,0.15)', color: 'white', flexShrink: 0 }}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
