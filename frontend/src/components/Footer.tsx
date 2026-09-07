import { Link } from 'react-router-dom';
import { useLanguage } from '../lib/language-context';

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="flex-center gap-md muted" style={{ padding: '16px 12px 24px', fontSize: 13, flexWrap: 'wrap' }}>
      <Link to="/privacy" style={{ color: 'inherit' }}>
        {t('legal.privacy')}
      </Link>
      <Link to="/terms" style={{ color: 'inherit' }}>
        {t('legal.terms')}
      </Link>
      <Link to="/cookies" style={{ color: 'inherit' }}>
        {t('legal.cookies')}
      </Link>
    </footer>
  );
}
