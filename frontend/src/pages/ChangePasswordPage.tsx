import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Topbar } from '../components/Topbar';
import { PasswordRules } from '../components/PasswordRules';
import { isStrongPassword } from '../lib/password';

/** Change your own password -- open to every role (admins have no profile page, so this lives on
 * its own route, reachable from the floating menu). The backend checks the current password and
 * signs every other device out. */
export function ChangePasswordPage() {
  const { t, lang } = useLanguage();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError(t('profile.passwordMismatch'));
      return;
    }
    if (!isStrongPassword(next)) {
      setError(t('auth.passwordWeak'));
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(translateApiError(lang, message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack">
      <Topbar title={t('profile.changePassword')} subtitle={t('profile.changePasswordSubtitle')} />
      <form className="card stack" onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        {error && (
          <div className="form-error-banner" role="alert">
            {error}
          </div>
        )}
        {done && (
          <p className="badge badge-gold" role="status" style={{ width: 'fit-content' }}>
            ✅ {t('profile.passwordChanged')}
          </p>
        )}
        <div className="field">
          <label htmlFor="current-password">{t('profile.currentPassword')}</label>
          <input
            id="current-password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="new-password">{t('profile.newPassword')}</label>
          <input
            id="new-password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            aria-describedby="new-password-rules"
            required
          />
          <PasswordRules id="new-password-rules" value={next} />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">{t('profile.confirmPassword')}</label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? t('profile.changingPassword') : t('profile.changePasswordButton')}
        </button>
      </form>
    </div>
  );
}
