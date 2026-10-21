import { useTheme } from '../lib/theme-context';
import { useLanguage } from '../lib/language-context';
import { ThemeSwitch } from './Switch';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const label = theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark');
  return (
    <button type="button" onClick={toggleTheme} className="switch-btn" title={label} aria-label={label}>
      <ThemeSwitch />
    </button>
  );
}
