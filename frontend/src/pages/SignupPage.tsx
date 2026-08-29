import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { AuthShell } from '../components/AuthShell';
import { Avatar, AVATAR_OPTIONS, avatarLabel } from '../components/Avatar';

export function SignupPage() {
  const { signup } = useAuth();
  const { t, lang } = useLanguage();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [avatarKey, setAvatarKey] = useState('falcon');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup({ username, email, password, displayName, avatarKey });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(translateApiError(lang, message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title={t('auth.signupTitle')} subtitle={t('auth.signupSubtitle')}>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error-banner">{error}</div>}

        <div className="field">
          <label>{t('auth.chooseHero')}</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {AVATAR_OPTIONS.map((key) => (
              <button
                type="button"
                key={key}
                onClick={() => setAvatarKey(key)}
                title={avatarLabel(key, lang)}
                style={{
                  background: 'none',
                  border: avatarKey === key ? '3px solid var(--maroon)' : '3px solid transparent',
                  borderRadius: '50%',
                  padding: 2,
                  cursor: 'pointer',
                }}
              >
                <Avatar avatarKey={key} size={44} />
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="displayName">{t('auth.displayName')}</label>
          <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor="username">{t('auth.username')}</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            pattern="[a-zA-Z0-9_]{3,20}"
            title={t('auth.usernameHint')}
          />
        </div>
        <div className="field">
          <label htmlFor="email">{t('auth.parentEmail')}</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">{t('auth.password')}</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? t('auth.signingUp') : t('auth.signupButton')}
        </button>
      </form>
      <p className="text-center muted" style={{ marginTop: 18 }}>
        {t('auth.alreadyHaveAccount')} <Link to="/login">{t('auth.login')}</Link>
      </p>
    </AuthShell>
  );
}
