import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';

/** "Enter the 6-digit code we emailed you" -- shared by the signup and login pages. On success
 * the backend verifies the account AND logs the user in (auth-context sets the user), so the
 * router moves on by itself. `idToken` is the Firebase token from signup / the login response. */
export function OtpVerifyForm({ idToken, initialCooldown = 60 }: { idToken: string; initialCooldown?: number }) {
  const { verifyOtp, resendVerification } = useAuth();
  const { t, lang } = useLanguage();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(initialCooldown);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      await verifyOtp(idToken, code);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(translateApiError(lang, message));
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await resendVerification(idToken, lang === 'ar' ? 'ar' : 'en');
      setCode('');
      setInfo(t('auth.otpSent'));
      setCooldown(60);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(translateApiError(lang, message));
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="form-error-banner" role="alert">
          {error}
        </div>
      )}
      {info && (
        <p className="text-center muted" role="status" style={{ marginBottom: 12 }}>
          {info}
        </p>
      )}
      <div className="field">
        <label htmlFor="otp-code">{t('auth.otpLabel')}</label>
        <input
          id="otp-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="\d{6}"
          placeholder="000000"
          dir="ltr"
          autoFocus
          required
          style={{ textAlign: 'center', fontSize: 28, letterSpacing: '0.45em', fontVariantNumeric: 'tabular-nums' }}
        />
        <small className="muted">{t('auth.otpHint')}</small>
      </div>
      <button className="btn btn-primary btn-block" type="submit" disabled={submitting || code.length !== 6}>
        {submitting ? t('auth.otpVerifying') : t('auth.otpButton')}
      </button>
      <button
        className="btn btn-secondary btn-block"
        type="button"
        style={{ marginTop: 10 }}
        onClick={handleResend}
        disabled={resending || cooldown > 0}
      >
        {resending ? t('auth.resending') : cooldown > 0 ? t('auth.otpResendIn', { s: cooldown }) : t('auth.otpResend')}
      </button>
    </form>
  );
}
