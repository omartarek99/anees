import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { CHALLENGE_EVENT } from './ChallengeHost';
import '../styles/challenge.css';

type Subject = 'math' | 'science';
type Difficulty = 'easy' | 'medium' | 'hard';
const COUNTS = [5, 10, 15, 20];
const PRIZE: Record<Difficulty, number> = { easy: 10, medium: 15, hard: 20 };

/** "تحدى صديقك": the window opened from a friend's row -- pick the subject, the difficulty and the number of questions, then start. The friend
 * gets the invitation as a pop-up (ChallengeHost.tsx). */
export function ChallengeSetupModal({ friend, onClose }: { friend: { username: string; displayName: string } | null; onClose: () => void }) {
  const { t } = useLanguage();
  const [subject, setSubject] = useState<Subject>('math');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [count, setCount] = useState(10);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { lang } = useLanguage();

  useEscapeToClose(onClose, friend !== null);

  async function start() {
    if (!friend) return;
    setSending(true);
    setError(null);
    try {
      await api.post('/challenges', { username: friend.username, subject, difficulty, count });
      window.dispatchEvent(new Event(CHALLENGE_EVENT)); // look for the new challenge right away
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
    } finally {
      setSending(false);
    }
  }

  return (
    <AnimatePresence>
      {friend && (
        <m.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <m.div
            className="modal-panel ch-setup"
            role="dialog"
            aria-modal="true"
            aria-label={t('challenge.setupTitle', { name: friend.displayName })}
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div style={{ fontSize: 40 }} aria-hidden>
                ⚔️
              </div>
              <h2 style={{ fontSize: 21, margin: '6px 0 2px' }}>{t('challenge.setupTitle', { name: friend.displayName })}</h2>
            </div>

            {error && <div className="form-error-banner">{error}</div>}

            <div className="ch-field">
              <label>{t('challenge.subject')}</label>
              <div className="ch-pills">
                {(['math', 'science'] as const).map((s) => (
                  <button key={s} type="button" className={`ch-pill${subject === s ? ' is-on' : ''}`} aria-pressed={subject === s} onClick={() => setSubject(s)}>
                    {s === 'math' ? '🧮' : '🔬'} {t(s === 'math' ? 'worksheets.math' : 'worksheets.science')}
                  </button>
                ))}
              </div>
            </div>

            <div className="ch-field">
              <label>{t('challenge.difficulty')}</label>
              <div className="ch-pills">
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <button key={d} type="button" className={`ch-pill${difficulty === d ? ' is-on' : ''}`} aria-pressed={difficulty === d} onClick={() => setDifficulty(d)}>
                    {t(`worksheets.${d}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="ch-field">
              <label>{t('challenge.count')}</label>
              <div className="ch-pills">
                {COUNTS.map((n) => (
                  <button key={n} type="button" className={`ch-pill${count === n ? ' is-on' : ''}`} aria-pressed={count === n} onClick={() => setCount(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <p className="muted text-center" style={{ fontSize: 13, margin: '4px 0 0' }}>
              {t('challenge.prizeNote', { points: PRIZE[difficulty] })}
            </p>

            <div className="flex gap-sm" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={sending} onClick={start}>
                {sending ? t('challenge.sending') : t('challenge.start')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('common.cancel')}
              </button>
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
