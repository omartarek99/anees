import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { AuthShell } from '../components/AuthShell';
import { PasswordRules } from '../components/PasswordRules';
import { isStrongPassword } from '../lib/password';

type Step = 'email' | 'code' | 'done';

/** "Forgot your password?" -- step 1: enter your email, we send a 6-digit code (the server answers
 * the same whether or not the email has an account). Step 2: the code + a new password. */
export function ForgotPasswordPage() {
  const { t, lang } = useLanguage();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function fail(err: unknown) {
    const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
    setError(translateApiError(lang, message));
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim(), lang: lang === 'ar' ? 'ar' : 'en' });
      setStep('code');
      setCooldown(60);
      setInfo(t('auth.resetCodeSent', { email: email.trim() }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password !== confirm) {
      setError(t('profile.passwordMismatch'));
      return;
    }
    if (!isStrongPassword(password)) {
      setError(t('auth.passwordWeak'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { email: email.trim(), code, newPassword: password });
      setStep('done');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <AuthShell title={t('auth.resetDoneTitle')} subtitle={t('auth.resetDoneBody')}>
        <Link className="btn btn-primary btn-block" to="/login" style={{ textAlign: 'center' }}>
          {t('auth.loginButton')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t('auth.forgotTitle')}
      subtitle={step === 'email' ? t('auth.forgotSubtitle') : t('auth.resetCodeSubtitle')}
    >
      {error && (
        <div className="form-error-banner" role="alert">
          {error}
        </div>
      )}
      {info && step === 'code' && (
        <p className="text-center muted" role="status" style={{ marginBottom: 12 }}>
          {info}
        </p>
      )}

      {step === 'email' ? (
        <form onSubmit={sendCode}>
          <div className="field">
            <label htmlFor="reset-email">{t('auth.email')}</label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? t('auth.resetSending') : t('auth.sendResetCode')}
          </button>
        </form>
      ) : (
        <form onSubmit={resetPassword}>
          <div className="field">
            <label htmlFor="reset-code">{t('auth.otpLabel')}</label>
            <input
              id="reset-code"
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
            <small className="muted">{t('auth.otpHint')}</small>
          </div>
          <div className="field">
            <label htmlFor="reset-new">{t('profile.newPassword')}</label>
            <input
              id="reset-new"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-describedby="reset-new-rules"
              required
            />
            <PasswordRules id="reset-new-rules" value={password} />
          </div>
          <div className="field">
            <label htmlFor="reset-confirm">{t('profile.confirmPassword')}</label>
            <input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || code.length !== 6}>
            {busy ? t('profile.changingPassword') : t('auth.resetButton')}
          </button>
          <button
            className="btn btn-secondary btn-block"
            type="button"
            style={{ marginTop: 10 }}
            onClick={() => sendCode()}
            disabled={busy || cooldown > 0}
          >
            {cooldown > 0 ? t('auth.otpResendIn', { s: cooldown }) : t('auth.otpResend')}
          </button>
        </form>
      )}

      <p className="text-center muted" style={{ marginTop: 18 }}>
        <Link to="/login">{t('auth.backToLogin')}</Link>
      </p>
    </AuthShell>
  );
}
