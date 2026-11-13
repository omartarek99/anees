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
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false); // a code was emailed: show the code box

  async function resend() {
    setError(null);
    try {
      await api.post('/auth/change-password/code', { currentPassword: current, lang });
    } catch (err) {
      setError(translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'));
    }
  }

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
      // Step 1 checks the current password and emails a code; accounts without a mailbox (method 'none') skip it.
      if (!codeSent) {
        const { method } = await api.post<{ method: 'otp' | 'none' }>('/auth/change-password/code', { currentPassword: current, lang });
        if (method === 'otp') {
          setCodeSent(true);
          return;
        }
      }
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next, ...(codeSent ? { code } : {}) });
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      setCode('');
      setCodeSent(false);
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
            onChange={(e) => {
              setCurrent(e.target.value);
              setCodeSent(false); // a different password needs a fresh check
            }}
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
        {codeSent && (
          <div className="field">
            <label htmlFor="change-code">{t('auth.otpLabel')}</label>
            <input
              id="change-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              dir="ltr"
              autoFocus
              required
              style={{ textAlign: 'center', fontSize: 28, letterSpacing: '0.45em', fontVariantNumeric: 'tabular-nums' }}
            />
            <small className="muted">
              {t('profile.passwordCodeSent')} {t('auth.otpHint')}
            </small>
            <button type="button" className="btn btn-ghost" onClick={resend} style={{ width: 'fit-content' }}>
              {t('auth.otpResend')}
            </button>
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={submitting || (codeSent && code.length !== 6)}>
          {submitting ? t('profile.changingPassword') : codeSent ? t('profile.changePasswordButton') : t('auth.sendResetCode')}
        </button>
      </form>
    </div>
  );
}
