import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText, translateApiError } from '../lib/i18n';
import { QuizResults, type ResultItem } from './QuizResults';
import { BossArt } from './BossArt';
import { getBossConfig, computeBossHp, ENCOURAGEMENT_AR, randomFrom } from '../lib/boss-config';

type BossDetail = {
  comingSoon: boolean;
  level: { levelNumber: number; title: string; titleAr?: string | null };
  questions: { id: number; text: string; textAr?: string | null; choices: string[]; choicesAr?: string[] | null }[];
  progress: { status: string; stars: number };
};

type BossSubmitResult = {
  passed: boolean;
  results: ResultItem[];
  correctCount: number;
  total: number;
  xpEarned: number;
  leveledUp: boolean;
  newPlayerLevel: number;
};

type CheckResponse = { isCorrect: boolean; correctIndex: number; explanation: string; explanationAr: string };

const IDLE_FRAMES = ['translateY(0) rotate(0deg)', 'translateY(-8px) rotate(1.5deg)', 'translateY(0) rotate(0deg)', 'translateY(-4px) rotate(-1deg)'];
const ENRAGE_FRAMES = ['translate(0,0)', 'translate(-6px,-2px)', 'translate(6px,2px)', 'translate(-4px,-1px)', 'translate(4px,1px)'];
const HIT_FRAMES = ['scale(0.82) rotate(-5deg)', 'scale(1.1) rotate(4deg)', 'scale(0.97) rotate(-2deg)', 'scale(1) rotate(0deg)'];
const MISS_FRAMES = ['translateX(5px)', 'translateX(-5px)', 'translateX(3px)', 'translateX(0)'];

/** Cycles through `frames` on a JS timer (not CSS @keyframes — see note in theme.css)
 * while `active`, relying on the element's own CSS `transition` to interpolate between them. */
function useLoopingTransform(active: boolean, frames: string[], stepMs: number): string {
  const [transform, setTransform] = useState(frames[0]);
  useEffect(() => {
    if (!active) {
      setTransform('none');
      return;
    }
    let i = 0;
    setTransform(frames[0]);
    const iv = setInterval(() => {
      i = (i + 1) % frames.length;
      setTransform(frames[i]);
    }, stepMs);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepMs]);
  return transform;
}

/** Plays a short one-shot sequence of transforms via chained timeouts, then rests at 'none'. */
function usePulseTransform(trigger: unknown, frames: string[], stepMs: number): string {
  const [transform, setTransform] = useState('none');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timers = frames.map((frame, i) => setTimeout(() => setTransform(frame), i * stepMs));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return transform;
}

export function BossArena({ levelNumber, onClose }: { levelNumber: number; onClose: () => void }) {
  const { refreshUser } = useAuth();
  const { t, lang } = useLanguage();
  const config = useMemo(() => getBossConfig(levelNumber), [levelNumber]);

  const [detail, setDetail] = useState<BossDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<CheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [answers, setAnswers] = useState<{ questionId: number; choiceIndex: number }[]>([]);
  const [resultsSoFar, setResultsSoFar] = useState<boolean[]>([]);
  const [banner, setBanner] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BossSubmitResult | null>(null);
  const [entered, setEntered] = useState(false);
  const [posed, setPosed] = useState(false);
  const [hitTrigger, setHitTrigger] = useState(0);
  const [lastHitKind, setLastHitKind] = useState<'hit' | 'miss'>('hit');

  useEffect(() => {
    setBanner(randomFrom(ENCOURAGEMENT_AR.start));
    api
      .get<BossDetail>(`/map/boss/${levelNumber}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('boss.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelNumber]);

  // Entrance: mount at a scaled-down/faded state, flip to normal one tick later so the
  // CSS transition actually has two distinct states to interpolate between.
  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 30);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setBannerVisible(false);
    const timer = setTimeout(() => setBannerVisible(true), 30);
    return () => clearTimeout(timer);
  }, [banner]);

  const questions = detail?.questions ?? [];
  const total = questions.length;
  const currentQ = questions[qIndex];
  const currentText = currentQ ? pickText(lang, currentQ.text, currentQ.textAr) : '';
  const currentChoices = currentQ ? (lang === 'ar' && currentQ.choicesAr?.length ? currentQ.choicesAr : currentQ.choices) : [];

  const hp = computeBossHp(config, resultsSoFar, total || 1);
  const isEnrageBoss = config.mechanic === 'enrage';
  const enraged = isEnrageBoss && hp < 50 && hp > 0;
  const levelTitle = detail ? pickText(lang, detail.level.title, detail.level.titleAr) : '';
  const mechanicName = pickText(lang, config.mechanicNameEn, config.mechanicNameAr);
  const mechanicHint = pickText(lang, config.mechanicHintEn, config.mechanicHintAr);

  const idleTransform = useLoopingTransform(!enraged && !!detail && !detail.comingSoon, IDLE_FRAMES, 550);
  const enrageTransform = useLoopingTransform(enraged, ENRAGE_FRAMES, 130);
  const pulseTransform = usePulseTransform(hitTrigger, lastHitKind === 'hit' ? HIT_FRAMES : MISS_FRAMES, 110);

  // Delay the results-screen pose by one frame so the CSS transition (start pose -> end pose) actually animates.
  useEffect(() => {
    if (!result) return;
    setPosed(false);
    const timer = setTimeout(() => setPosed(true), 30);
    return () => clearTimeout(timer);
  }, [result]);

  async function handleAttack() {
    if (selected === null || !currentQ || checking) return;
    setChecking(true);
    try {
      const res = await api.post<CheckResponse>(`/map/boss/${levelNumber}/check`, {
        questionId: currentQ.id,
        choiceIndex: selected,
      });
      setFeedback(res);
      setLastHitKind(res.isCorrect ? 'hit' : 'miss');
      setHitTrigger((n) => n + 1);
      setAnswers((prev) => [...prev, { questionId: currentQ.id, choiceIndex: selected }]);
      const nextResults = [...resultsSoFar, res.isCorrect];
      setResultsSoFar(nextResults);
      const nextHp = computeBossHp(config, nextResults, total || 1);
      if (res.isCorrect) {
        setBanner(nextHp > 0 && nextHp <= 35 ? randomFrom(ENCOURAGEMENT_AR.lowHp) : randomFrom(ENCOURAGEMENT_AR.correct));
      } else {
        setBanner(randomFrom(ENCOURAGEMENT_AR.wrong));
      }
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('boss.loadError'));
    } finally {
      setChecking(false);
    }
  }

  async function handleNext() {
    setFeedback(null);
    setSelected(null);
    if (qIndex + 1 < total) {
      setQIndex((i) => i + 1);
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<BossSubmitResult>(`/map/boss/${levelNumber}/submit`, { answers });
      setResult(res);
      setBanner(res.passed ? randomFrom(ENCOURAGEMENT_AR.victory) : randomFrom(ENCOURAGEMENT_AR.defeat));
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('boss.loadError'));
    } finally {
      setSubmitting(false);
    }
  }

  const outerTransform = enraged ? enrageTransform : idleTransform;

  return (
    <div className="modal-overlay">
      <div className="boss-arena-panel" onClick={(e) => e.stopPropagation()}>
        {error && <div className="form-error-banner">{error}</div>}

        {!detail && !error && (
          <div className="empty-state">
            <div className="spinner" />
          </div>
        )}

        {detail?.comingSoon && (
          <div className="text-center" style={{ padding: 28 }}>
            <div style={{ fontSize: 44 }}>🚧</div>
            <h2>{levelTitle}</h2>
            <p className="muted">{t('boss.forging')}</p>
            <button className="btn btn-primary" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        )}

        {detail && !detail.comingSoon && !result && (
          <>
            <div
              className="boss-encourage-banner boss-banner-transition"
              style={{ opacity: bannerVisible ? 1 : 0, transform: bannerVisible ? 'translateY(0)' : 'translateY(-10px)' }}
            >
              {banner}
            </div>

            <div className="boss-arena-grid">
              <div
                className="boss-stage"
                style={{
                  background: `radial-gradient(circle at 50% 20%, ${config.colorPrimary}33, transparent 70%)`,
                }}
              >
                <div
                  className="boss-art-transition"
                  style={{
                    width: 160,
                    height: 160,
                    opacity: entered ? 1 : 0,
                    transform: entered ? 'scale(1) translateY(0)' : 'scale(0.5) translateY(-24px)',
                  }}
                >
                  <div className="boss-art-transition" style={{ width: '100%', height: '100%', transform: outerTransform }}>
                    <div className="boss-punch-transition" style={{ width: '100%', height: '100%', transform: pulseTransform }}>
                      <BossArt artKey={config.artKey} primary={config.colorPrimary} secondary={config.colorSecondary} glow={config.glow} enraged={enraged} />
                    </div>
                  </div>
                </div>
                <h2 style={{ margin: 0 }}>{levelTitle}</h2>
                <span className="badge badge-gold">{mechanicName}</span>
                <p className="muted" style={{ fontSize: 13 }}>
                  {mechanicHint}
                </p>
                <div style={{ width: '100%' }}>
                  <p style={{ fontWeight: 700, marginBottom: 6 }}>{t('boss.hp')}</p>
                  <div className="boss-hp-track">
                    <div className="boss-hp-fill" style={{ width: `${hp}%` }} />
                  </div>
                </div>
                {total > 0 && (
                  <p className="muted" style={{ fontSize: 13 }}>
                    {t('boss.questionProgress', { current: qIndex + 1, total })}
                  </p>
                )}
              </div>

              <div className="boss-question-panel">
                {submitting && (
                  <div className="empty-state">
                    <div className="spinner" />
                  </div>
                )}

                {!submitting && currentQ && (
                  <div className="stack">
                    <p style={{ fontWeight: 700, fontSize: 17 }}>{currentText}</p>
                    <div className="stack" style={{ gap: 8 }}>
                      {currentChoices.map((choice, ci) => {
                        const isSelected = selected === ci;
                        const showFeedback = feedback !== null;
                        const isCorrectChoice = showFeedback && ci === feedback.correctIndex;
                        const isWrongSelected = showFeedback && isSelected && !feedback.isCorrect;
                        let cls = 'btn boss-choice-btn';
                        if (isCorrectChoice) cls += ' boss-choice-correct';
                        else if (isWrongSelected) cls += ' boss-choice-wrong';
                        return (
                          <button
                            key={ci}
                            type="button"
                            disabled={showFeedback}
                            onClick={() => setSelected(ci)}
                            className={cls}
                            style={
                              !showFeedback
                                ? {
                                    background: isSelected ? 'var(--maroon-pale)' : 'var(--sand-light)',
                                    border: isSelected ? '2px solid var(--maroon)' : '2px solid transparent',
                                    color: 'var(--ink)',
                                  }
                                : undefined
                            }
                          >
                            <span
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: isSelected && !showFeedback ? 'var(--maroon)' : 'var(--sand-dark)',
                                color: 'white',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12,
                                flexShrink: 0,
                                marginInlineEnd: 8,
                              }}
                            >
                              {String.fromCharCode(65 + ci)}
                            </span>
                            {choice}
                          </button>
                        );
                      })}
                    </div>

                    {feedback && (
                      <div className={feedback.isCorrect ? 'form-success-banner' : 'form-error-banner'}>
                        {pickText(lang, feedback.explanation, feedback.explanationAr)}
                      </div>
                    )}

                    {!feedback && (
                      <button className="btn btn-primary btn-block" disabled={selected === null || checking} onClick={handleAttack}>
                        {checking ? t('quiz.checking') : t('quiz.attack')}
                      </button>
                    )}
                    {feedback && (
                      <button className="btn btn-primary btn-block" onClick={handleNext}>
                        {qIndex + 1 < total ? t('boss.nextQuestion') : t('boss.finalStrike')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {detail && result && (
          <div className="stack" style={{ padding: 24 }}>
            <div className="text-center">
              <div
                className="boss-defeated-pose"
                style={{
                  width: 130,
                  height: 130,
                  margin: '0 auto',
                  opacity: posed ? (result.passed ? 0.5 : 1) : 0,
                  transform: posed && result.passed ? 'rotate(78deg) scale(0.9) translateY(10px)' : 'rotate(0deg) scale(1) translateY(0)',
                  filter: result.passed ? 'grayscale(0.6)' : 'none',
                }}
              >
                <BossArt artKey={config.artKey} primary={config.colorPrimary} secondary={config.colorSecondary} glow={config.glow} enraged={!result.passed} />
              </div>
              <div style={{ fontSize: 50 }}>{result.passed ? '🏆' : '💥'}</div>
              <h2>{result.passed ? t('boss.victory') : t('boss.survives')}</h2>
              <p className="muted">{t('boss.correctCount', { correct: result.correctCount, total: result.total })}</p>
              <div className="boss-encourage-banner" style={{ margin: '12px auto', maxWidth: 420 }}>
                {result.passed ? randomFrom(ENCOURAGEMENT_AR.victory) : randomFrom(ENCOURAGEMENT_AR.defeat)}
              </div>
              {result.passed && (
                <p className="badge badge-gold" style={{ fontSize: 15, marginTop: 12 }}>
                  {t('common.xpGained', { xp: result.xpEarned })}
                </p>
              )}
              {!result.passed && <p className="muted" style={{ marginTop: 12 }}>{t('boss.reviewRetry')}</p>}
            </div>
            <QuizResults
              questions={questions.map((q) => ({ id: q.id, text: pickText(lang, q.text, q.textAr), choices: lang === 'ar' && q.choicesAr?.length ? q.choicesAr : q.choices }))}
              results={result.results}
            />
            <button className="btn btn-primary btn-block" onClick={onClose}>
              {result.passed ? t('boss.continueJourney') : t('boss.backToMap')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
