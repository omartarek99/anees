import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth, type Role } from '../lib/auth-context';
import { ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { AuthShell } from '../components/AuthShell';
import { Avatar, AVATAR_OPTIONS, avatarLabel } from '../components/Avatar';

/** "By signing up you agree to our Terms and Privacy Policy" with the two names as real links —
 * split on the {terms}/{privacy} placeholders since t() only returns plain text. */
function SignupConsent() {
  const { t } = useLanguage();
  const [before, rest] = t('legal.signupConsent').split('{terms}');
  const [middle, after] = rest.split('{privacy}');
  return (
    <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 16 }}>
      {before}
      <Link to="/terms">{t('legal.terms')}</Link>
      {middle}
      <Link to="/privacy">{t('legal.privacy')}</Link>
      {after}
    </p>
  );
}

export function SignupPage() {
  const { signup, resendVerification } = useAuth();
  const { t, lang } = useLanguage();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [avatarKey, setAvatarKey] = useState('falcon');
  const [role, setRole] = useState<Role>('student');
  const [grade, setGrade] = useState('');
  const [idDocument, setIdDocument] = useState<File | null>(null);
  // Honeypot -- real students never see or fill this (positioned off-screen below), so a
  // non-empty value here means a bot filled every field it found. See schemas.ts's
  // matching `website` check for what happens if it isn't blank.
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingIdToken, setPendingIdToken] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signup({
        username,
        email,
        password,
        displayName,
        avatarKey,
        role,
        grade: role === 'student' ? Number(grade) : undefined,
        idDocument: role === 'teacher' ? idDocument ?? undefined : undefined,
        website,
      });
      setPendingEmail(result.email);
      setPendingIdToken(result.idToken);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(translateApiError(lang, message));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!pendingIdToken) return;
    setResending(true);
    setResent(false);
    try {
      await resendVerification(pendingIdToken);
      setResent(true);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(translateApiError(lang, message));
    } finally {
      setResending(false);
    }
  }

  if (pendingEmail) {
    return (
      <AuthShell title={t('auth.checkYourEmailTitle')} subtitle={t('auth.checkYourEmailBody', { email: pendingEmail })}>
        {error && <div className="form-error-banner">{error}</div>}
        <button className="btn btn-secondary btn-block" type="button" onClick={handleResend} disabled={resending}>
          {resending ? t('auth.resending') : t('auth.resendVerification')}
        </button>
        {resent && (
          <p className="text-center muted" style={{ marginTop: 12 }}>
            {t('auth.resendSent')}
          </p>
        )}
        <p className="text-center muted" style={{ marginTop: 18 }}>
          <Link to="/login">{t('auth.backToLogin')}</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.signupTitle')} subtitle={t('auth.signupSubtitle')}>
      <form onSubmit={handleSubmit}>
        <AnimatePresence>
          {error && (
            <motion.div
              className="form-error-banner"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="field">
          <label>{t('auth.chooseHero')}</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {AVATAR_OPTIONS.map((key) => {
              const chosen = avatarKey === key;
              return (
                <motion.button
                  type="button"
                  key={key}
                  onClick={() => setAvatarKey(key)}
                  title={avatarLabel(key, lang)}
                  whileTap={{ scale: 0.9 }}
                  animate={{ scale: chosen ? 1.12 : 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                  style={{
                    background: 'none',
                    border: chosen ? '3px solid var(--maroon)' : '3px solid transparent',
                    transition: 'border-color 0.2s ease',
                    borderRadius: '50%',
                    padding: 2,
                    cursor: 'pointer',
                  }}
                >
                  <Avatar avatarKey={key} size={44} />
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label>{t('auth.iAmA')}</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className={`btn ${role === 'student' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setRole('student')}
            >
              {t('auth.roleStudent')}
            </button>
            <button
              type="button"
              className={`btn ${role === 'teacher' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setRole('teacher')}
            >
              {t('auth.roleTeacher')}
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="displayName">{t('auth.displayName')}</label>
          <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={40} />
        </div>
        <AnimatePresence>
          {role === 'student' && (
            <motion.div
              className="field"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              <label htmlFor="grade">{t('auth.grade')}</label>
              <input
                id="grade"
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                placeholder={t('auth.gradePlaceholder')}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                required
                title={t('auth.gradeHint')}
              />
            </motion.div>
          )}
          {role === 'teacher' && (
            <motion.div
              className="field"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              <label htmlFor="idDocument">{t('auth.teacherIdLabel')}</label>
              <input
                id="idDocument"
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => setIdDocument(e.target.files?.[0] ?? null)}
                required
                title={t('auth.teacherIdHint')}
              />
              <small className="muted">{t('auth.teacherIdHint')}</small>
            </motion.div>
          )}
        </AnimatePresence>
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
        {/* Honeypot -- invisible and unreachable by keyboard/AT for a real person (off-screen,
            not display:none, since some bots specifically skip display:none fields), but a
            generic bot filling every input it finds fills this too. */}
        <div style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <SignupConsent />
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
