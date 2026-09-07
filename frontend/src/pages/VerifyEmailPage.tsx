import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { AuthShell } from '../components/AuthShell';

export function VerifyEmailPage() {
  const { verifyEmail } = useAuth();
  const { t, lang } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const oobCode = params.get('oobCode');

    if (!oobCode) {
      setError('Invalid or expired verification link.');
      return;
    }

    verifyEmail(oobCode).catch((err) => {
      const message = err instanceof ApiError ? err.message : 'Invalid or expired verification link.';
      setError(message);
    });
  }, [verifyEmail]);

  if (error) {
    return (
      <AuthShell title={t('auth.verifyErrorTitle')} subtitle={translateApiError(lang, error) || t('auth.verifyErrorBody')}>
        <p className="text-center muted" style={{ marginTop: 18 }}>
          <Link to="/login">{t('auth.backToLogin')}</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.verifying')} subtitle="">
      <div className="flex-center" style={{ padding: '24px 0' }}>
        <div className="spinner" />
      </div>
    </AuthShell>
  );
}
