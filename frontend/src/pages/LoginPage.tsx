import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { AuthShell } from '../components/AuthShell';

export function LoginPage() {
  const { login } = useAuth();
  const { t, lang } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ username, password });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(translateApiError(lang, message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error-banner">{error}</div>}
        <div className="field">
          <label htmlFor="username">{t('auth.username')}</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">{t('auth.password')}</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? t('auth.loggingIn') : t('auth.loginButton')}
        </button>
      </form>
      <p className="text-center muted" style={{ marginTop: 18 }}>
        {t('auth.newHere')} <Link to="/signup">{t('auth.createAccount')}</Link>
      </p>
    </AuthShell>
  );
}
