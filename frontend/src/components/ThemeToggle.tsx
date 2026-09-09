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
      className="btn btn-sm"
      title={label}
      aria-label={label}
      style={
        floating
          ? { background: 'var(--white)', color: 'var(--maroon)', border: '2px solid var(--maroon)' }
          : { background: 'rgba(255,255,255,0.15)', color: 'white', flexShrink: 0 }
      }
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
