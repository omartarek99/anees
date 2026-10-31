import { useCallback, useEffect, useRef, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { textDir } from '../lib/bidi';
import '../styles/challenge.css';

/** Fired (by the setup window) to look for a new challenge right away instead of at the next poll. */
export const CHALLENGE_EVENT = 'anees:challenge';

type Question = { id: number; text: string; textAr?: string | null; choices: string[]; choicesAr?: string[] | null };
type ReviewItem = { text: string; textAr?: string | null; choices: string[]; choicesAr?: string[] | null; correctIndex: number; mine: number; theirs: number; explanation: string; explanationAr?: string | null };
type Challenge = {
  id: number;
  role: 'challenger' | 'challenged';
  status: 'pending' | 'active' | 'finished' | 'declined' | 'cancelled' | 'expired';
  subject: 'math' | 'science';
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
  prize: number;
  opponent: { username: string; displayName: string; avatarKey: string };
  now: number;
  endsAt: number | null;
  myAnswers?: Record<string, number>;
  questions?: Question[];
  result?: { myScore: number; theirScore: number; total: number; winner: 'me' | 'them' | 'draw'; points: number; submittedByMe: boolean; timeUp: boolean; review: ReviewItem[] };
};

const choicesOf = (lang: string, c: { choices: string[]; choicesAr?: string[] | null }) => (lang === 'ar' && c.choicesAr && c.choicesAr.every(Boolean) ? c.choicesAr : c.choices);

/**
 * Friend challenges, everything the two players see after one has pressed "Start" (the setup window is ChallengeSetupModal.tsx):
 *  - the invited friend gets a pop-up to accept or reject;
 *  - the challenger waits (and can cancel);
 *  - if accepted, both get the questions and a 5-minute clock; the first to submit stops the game for both;
 *  - then both see the two scores, who won, and the points.
 * It polls the server (GET /challenges/current) -- every couple of seconds while something is going on, slowly otherwise.
 */
export function ChallengeHost() {
  const { t, lang } = useLanguage();
  const { refreshUser } = useAuth();
  const [ch, setCh] = useState<Challenge | null>(null);
  const [clock, setClock] = useState(0); // server time - our time, so the timer is the same for both players
  const [now, setNow] = useState(Date.now());
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const idRef = useRef<number | null>(null);
  const submittedRef = useRef(false);
  const paidRef = useRef<number | null>(null);
  const closedRef = useRef<number | null>(null);

  const apply = useCallback((next: Challenge | null, serverNow?: number) => {
    if (serverNow) setClock(serverNow - Date.now());
    // a result that was just closed can still be in a reply that was already on its way: do not bring it back
    if (next && next.id === closedRef.current && next.status !== 'pending' && next.status !== 'active') return;
    if (next && next.id !== idRef.current) {
      // a different game: its answers start from what the server already has
      idRef.current = next.id;
      submittedRef.current = false;
      setShowReview(false);
      setAnswers(next.myAnswers ?? {});
    }
    if (!next) idRef.current = null;
    setCh(next);
  }, []);

  const poll = useCallback(() => {
    api
      .get<{ challenge: Challenge | null }>('/challenges/current')
      .then((d) => apply(d.challenge, d.challenge?.now))
      .catch(() => {});
  }, [apply]);

  // polling: quick while a challenge is going on, slow when idle, slower again while the tab is hidden
  useEffect(() => {
    poll();
    const fast = ch !== null && (ch.status === 'pending' || ch.status === 'active');
    const every = document.hidden ? 15_000 : fast ? 2_000 : 6_000;
    const id = window.setInterval(poll, every);
    const onEvent = () => poll();
    window.addEventListener(CHALLENGE_EVENT, onEvent);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(CHALLENGE_EVENT, onEvent);
    };
  }, [poll, ch?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // the countdown
  useEffect(() => {
    if (ch?.status !== 'active') return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [ch?.status]);

  const remainingMs = ch?.status === 'active' && ch.endsAt ? Math.max(0, ch.endsAt - (now + clock)) : 0;

  // save answers as they are given (so the other player's submit grades what you have so far)
  useEffect(() => {
    if (ch?.status !== 'active') return;
    const id = window.setTimeout(() => {
      api.patch(`/challenges/${ch.id}/answers`, { answers }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(id);
  }, [answers, ch?.id, ch?.status]);

  async function act(path: string, body: unknown = {}) {
    setBusy(true);
    try {
      const d = await api.post<{ challenge?: Challenge | null }>(path, body);
      if (d.challenge !== undefined) apply(d.challenge, d.challenge?.now);
      else poll();
    } catch {
      poll();
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!ch || submittedRef.current) return;
    submittedRef.current = true;
    await act(`/challenges/${ch.id}/submit`, { answers });
  }

  // time is up: hand in what you have
  useEffect(() => {
    if (ch?.status === 'active' && remainingMs <= 0 && !submittedRef.current) void submit();
  }, [remainingMs, ch?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // points were paid: refresh the points shown around the app, once per game
  useEffect(() => {
    if (ch?.status === 'finished' && ch.result && ch.result.points > 0 && ch.result.winner === 'me' && paidRef.current !== ch.id) {
      paidRef.current = ch.id;
      void refreshUser();
    }
  }, [ch?.status, ch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function close() {
    if (!ch) return;
    const id = ch.id;
    closedRef.current = id;
    setCh(null);
    idRef.current = null;
    try {
      await api.post(`/challenges/${id}/seen`, {});
    } catch {
      /* it will be offered again, harmless */
    }
  }

  if (!ch) return null;
  const name = ch.opponent.displayName;
  const subject = t(ch.subject === 'math' ? 'worksheets.math' : 'worksheets.science');
  const difficulty = t(`worksheets.${ch.difficulty}`);
  const mm = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
  const answered = ch.questions ? ch.questions.filter((q) => answers[String(q.id)] !== undefined).length : 0;

  return (
    <AnimatePresence mode="wait">
      <m.div key={`${ch.id}-${ch.status}`} className="modal-overlay ch-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <m.div
          className={`modal-panel text-center${ch.status === 'active' || ch.status === 'finished' ? ' ch-wide' : ''}`}
          role="alertdialog"
          aria-modal="true"
          initial={{ scale: 0.9, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          style={{ maxWidth: ch.status === 'active' || ch.status === 'finished' ? 640 : 400 }}
        >
          {/* a friend challenged you */}
          {ch.status === 'pending' && ch.role === 'challenged' && (
            <>
              <div style={{ fontSize: 44 }}>⚔️</div>
              <h2 style={{ fontSize: 21, margin: '8px 0 0' }}>{t('challenge.inviteTitle')}</h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.6, margin: '6px 0 0' }}>
                {t('challenge.inviteBody', { name, subject, difficulty, count: ch.count, points: ch.prize })}
              </p>
              <div className="flex gap-sm" style={{ marginTop: 20 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => act(`/challenges/${ch.id}/accept`)}>
                  {t('challenge.accept')}
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} disabled={busy} onClick={() => act(`/challenges/${ch.id}/decline`)}>
                  {t('challenge.reject')}
                </button>
              </div>
            </>
          )}

          {/* you challenged someone: waiting */}
          {ch.status === 'pending' && ch.role === 'challenger' && (
            <>
              <div className="spinner" style={{ margin: '4px auto 12px' }} />
              <h2 style={{ fontSize: 21, margin: 0 }}>{t('challenge.waitingTitle')}</h2>
              <p style={{ fontSize: 15.5, margin: '6px 0 0' }}>{t('challenge.waiting', { name })}</p>
              <button className="btn btn-secondary btn-block" style={{ marginTop: 18 }} disabled={busy} onClick={() => act(`/challenges/${ch.id}/cancel`)}>
                {t('challenge.cancelChallenge')}
              </button>
            </>
          )}

          {/* the game */}
          {ch.status === 'active' && ch.questions && (
            <div className="ch-game">
              <div className="ch-head">
                <div>
                  <strong>{t('challenge.gameTitle', { name })}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {subject} · {difficulty} · {t('challenge.answered', { n: answered, total: ch.count })}
                  </div>
                </div>
                <div className={`ch-timer${remainingMs < 60_000 ? ' is-low' : ''}`} aria-live="off" title={t('challenge.timeLeft')}>
                  ⏱ {mm}:{ss}
                </div>
              </div>
              <div className="ch-questions">
                {ch.questions.map((q, qi) => (
                  <div key={q.id} className="ch-q">
                    <p dir={textDir(pickText(lang, q.text, q.textAr))} style={{ fontWeight: 700, margin: '0 0 8px' }}>
                      {qi + 1}. {pickText(lang, q.text, q.textAr)}
                    </p>
                    <div className="ch-choices">
                      {choicesOf(lang, q).map((c, ci) => (
                        <button
                          key={ci}
                          type="button"
                          className={`ch-choice${answers[String(q.id)] === ci ? ' is-picked' : ''}`}
                          dir={textDir(c)}
                          onClick={() => setAnswers((a) => ({ ...a, [String(q.id)]: ci }))}
                        >
                          <span className="ch-letter">{['A', 'B', 'C', 'D'][ci]}</span>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={submit}>
                {t('challenge.submit')}
              </button>
              <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>{t('challenge.submitNote')}</p>
            </div>
          )}

          {/* the result */}
          {ch.status === 'finished' && ch.result && (
            <>
              <div style={{ fontSize: 46 }}>{ch.result.winner === 'me' ? '🏆' : ch.result.winner === 'draw' ? '🤝' : '👏'}</div>
              <h2 style={{ fontSize: 22, margin: '6px 0 0', color: ch.result.winner === 'me' ? 'var(--success)' : undefined }}>
                {ch.result.winner === 'me' ? t('challenge.youWon') : ch.result.winner === 'draw' ? t('challenge.draw') : t('challenge.theyWon', { name })}
              </h2>
              <p className="muted" style={{ fontSize: 13.5, margin: '2px 0 0' }}>
                {ch.result.timeUp ? t('challenge.timeUp') : ch.result.submittedByMe ? t('challenge.youSubmitted') : t('challenge.theySubmitted', { name })}
              </p>
              <div className="ch-scores">
                <div className={`ch-score${ch.result.winner === 'me' ? ' is-winner' : ''}`}>
                  <span>{t('challenge.you')}</span>
                  <b>
                    {ch.result.myScore}/{ch.result.total}
                  </b>
                </div>
                <div className="ch-vs">VS</div>
                <div className={`ch-score${ch.result.winner === 'them' ? ' is-winner' : ''}`}>
                  <span>{name}</span>
                  <b>
                    {ch.result.theirScore}/{ch.result.total}
                  </b>
                </div>
              </div>
              {ch.result.winner === 'me' && (
                <p className="badge badge-gold" style={{ fontSize: 15 }}>
                  {ch.result.points > 0 ? t('challenge.pointsEarned', { points: ch.result.points }) : t('challenge.noPoints')}
                </p>
              )}
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setShowReview((v) => !v)}>
                {showReview ? t('challenge.hideReview') : t('challenge.review')}
              </button>
              {showReview && (
                <div className="ch-review">
                  {ch.result.review.map((r, i) => {
                    const cs = choicesOf(lang, r);
                    return (
                      <div key={i} className="ch-q" style={{ textAlign: 'start' }}>
                        <p dir={textDir(pickText(lang, r.text, r.textAr))} style={{ fontWeight: 700, margin: '0 0 4px' }}>
                          {i + 1}. {pickText(lang, r.text, r.textAr)}
                        </p>
                        <p style={{ margin: '2px 0', fontSize: 13.5, color: 'var(--success)' }}>✔ {cs[r.correctIndex]}</p>
                        <p style={{ margin: '2px 0', fontSize: 13, opacity: 0.85 }}>
                          {t('challenge.you')}: {r.mine >= 0 ? cs[r.mine] : '—'} {r.mine === r.correctIndex ? '✅' : '❌'} · {name}: {r.theirs >= 0 ? cs[r.theirs] : '—'} {r.theirs === r.correctIndex ? '✅' : '❌'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
              <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={close}>
                {t('challenge.close')}
              </button>
            </>
          )}

          {/* it did not happen */}
          {(ch.status === 'declined' || ch.status === 'cancelled' || ch.status === 'expired') && (
            <>
              <div style={{ fontSize: 44 }}>{ch.status === 'declined' ? '🙅' : '⌛'}</div>
              <h2 style={{ fontSize: 20, margin: '8px 0 0' }}>
                {ch.status === 'declined' ? t('challenge.declined', { name }) : ch.status === 'cancelled' ? t('challenge.cancelled', { name }) : t('challenge.expired')}
              </h2>
              <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={close}>
                {t('challenge.close')}
              </button>
            </>
          )}
        </m.div>
      </m.div>
    </AnimatePresence>
  );
}
