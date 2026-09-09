import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { AuthShell } from '../components/AuthShell';

const UNVERIFIED_ERROR = 'Please verify your email before logging in.';

export function LoginPage() {
  const { login, resendVerification } = useAuth();
  const { t, lang } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const [bannedUntil, setBannedUntil] = useState<string | null>(null);
  const [unverifiedIdToken, setUnverifiedIdToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRawError(null);
    setBannedUntil(null);
    setUnverifiedIdToken(null);
    setResent(false);
    setSubmitting(true);
    try {
      await login({ username, password });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(translateApiError(lang, message));
      setRawError(message);
      if (err instanceof ApiError && err.status === 403) {
        const body = err.body as { idToken?: string; bannedUntil?: string } | null;
        if (body?.idToken) setUnverifiedIdToken(body.idToken);
        if (body?.bannedUntil) setBannedUntil(body.bannedUntil);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!unverifiedIdToken) return;
    setResending(true);
    setResent(false);
    try {
      await resendVerification(unverifiedIdToken);
      setResent(true);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(translateApiError(lang, message));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="form-error-banner">
            {error}
            {bannedUntil && ` (${new Date(bannedUntil).toLocaleString(lang === 'ar' ? 'ar' : 'en-US')})`}
          </div>
        )}
        {rawError === UNVERIFIED_ERROR && unverifiedIdToken && (
          <div className="field">
            <button className="btn btn-secondary btn-block" type="button" onClick={handleResend} disabled={resending}>
              {resending ? t('auth.resending') : t('auth.resendVerification')}
            </button>
            {resent && (
              <p className="text-center muted" style={{ marginTop: 8 }}>
                {t('auth.resendSent')}
              </p>
            )}
          </div>
        )}
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
