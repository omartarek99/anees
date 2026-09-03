import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Avatar } from './Avatar';
import { QuizCard, type QuizAnswer, type QuizQuestion } from './QuizCard';
import { QuizResults, type ResultItem } from './QuizResults';
import { LevelUpToast } from './LevelUpToast';

export type ReelSlideData = {
  levelNumber: number;
  reelId: number;
  title: string;
  scriptText: string;
  videoUrl: string | null;
  subjectIcon: string;
  subjectName: string;
  questions: QuizQuestion[];
  completed: boolean;
  stars: number;
};

type SubmitResult = {
  results: ResultItem[];
  correctCount: number;
  total: number;
  xpEarned: number;
  stars: number;
  leveledUp: boolean;
  newPlayerLevel: number;
};

type WatchResponse = { watchedSeconds: number; xpEarned: number; totalWatchXp: number };

export type ReelSlideControls = { commit: () => void; discard: () => void };

export function ReelSlide({
  data,
  isActive,
  onCompleted,
  onNext,
  hasNext,
  stillWatchingActive,
  stillWatchingCountdown,
  onConfirmStillWatching,
  onWatchSecond,
  registerActiveControls,
}: {
  data: ReelSlideData;
  isActive: boolean;
  onCompleted: (result: SubmitResult) => void;
  onNext: () => void;
  hasNext: boolean;
  /** The page-level "still watching?" prompt is currently up (see ReelsPage). While true, this
   * slide pauses watch-time accrual and shows the prompt overlay if it's the active slide. */
  stillWatchingActive: boolean;
  stillWatchingCountdown: number;
  onConfirmStillWatching: () => void;
  /** Called once per genuinely-watched second so the page can run the 20-minute check. */
  onWatchSecond: () => void;
  /** While this slide is the active one, hand the page a way to commit (flush to the server)
   * or discard this reel's un-flushed watch seconds. */
  registerActiveControls: (controls: ReelSlideControls | null) => void;
}) {
  const { t, lang } = useLanguage();
  const { user, refreshUser } = useAuth();
  const [mode, setMode] = useState<'watch' | 'quiz' | 'results'>('watch');
  const [playing, setPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levelUpValue, setLevelUpValue] = useState<number | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(() => 40 + ((data.levelNumber * 17) % 260));
  const [watchProgress, setWatchProgress] = useState(0); // 0-1, cosmetic top progress bar

  const pendingSecondsRef = useRef(0);
  const watchedTotalRef = useRef(0);
  const durationEstimate = 60; // reels don't carry a client-side duration yet; used only for the cosmetic bar

  // Latest values readable synchronously from inside the 1s tick / effect cleanups, which
  // otherwise only see the props from when they were set up (a stale closure).
  const stillWatchingActiveRef = useRef(stillWatchingActive);
  stillWatchingActiveRef.current = stillWatchingActive;
  const onWatchSecondRef = useRef(onWatchSecond);
  onWatchSecondRef.current = onWatchSecond;
  const flushRef = useRef<() => void>(() => {});

  async function flushWatchTime() {
    const pending = pendingSecondsRef.current;
    if (pending <= 0) return;
    pendingSecondsRef.current = 0;
    try {
      const res = await api.post<WatchResponse>(`/reels/${data.reelId}/watch`, { seconds: pending });
      if (res.xpEarned > 0) refreshUser();
    } catch {
      // watch-time XP is a bonus, not critical — drop silently on failure
    }
  }
  flushRef.current = flushWatchTime;

  // Real watch-time tracking: only ticks while this slide is the one actually in view, still
  // in "watch" mode, and the tab is visible — so scrolled-past or backgrounded slides can't
  // accrue XP. The reel itself keeps looping indefinitely (native <video loop>, or the
  // cosmetic timer wrapping back to 0 below) — nothing here ever advances to the next slide;
  // only the student scrolling does that.
  useEffect(() => {
    if (!isActive || mode !== 'watch') return;
    setPlaying(true);
    const tick = setInterval(() => {
      if (stillWatchingActiveRef.current) return; // paused, waiting on the page's "still watching?" prompt
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      pendingSecondsRef.current += 1;
      watchedTotalRef.current += 1;
      if (watchedTotalRef.current >= durationEstimate) watchedTotalRef.current = 0; // loop the cosmetic bar
      setWatchProgress(watchedTotalRef.current / durationEstimate);
      onWatchSecondRef.current();
    }, 1000);
    return () => {
      clearInterval(tick);
      // Scrolling to another reel / opening the quiz / navigating away are all "I'm really
      // here" signals — commit what was watched. The one exception: the page-level "still
      // watching?" prompt is up and unanswered, in which case the page's discard path clears
      // this pending stretch instead.
      if (!stillWatchingActiveRef.current) flushRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, mode]);

  // Pause the "playing" visuals while the prompt is up; resume once it's answered.
  useEffect(() => {
    setPlaying(!stillWatchingActive && isActive && mode === 'watch');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillWatchingActive]);

  // While this is the active slide, let the page commit or discard this reel's watch seconds
  // when the student answers (or ignores) the 20-minute check.
  useEffect(() => {
    if (!isActive) return;
    registerActiveControls({
      commit: () => flushRef.current(),
      discard: () => {
        pendingSecondsRef.current = 0;
        watchedTotalRef.current = 0;
        setWatchProgress(0);
      },
    });
    return () => registerActiveControls(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  async function handleSubmit(answers: QuizAnswer[]) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<SubmitResult>(`/reels/${data.reelId}/submit`, { answers });
      setResult(res);
      setMode('results');
      onCompleted(res);
      if (res.leveledUp) setLevelUpValue(res.newPlayerLevel);
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : 'Error');
    } finally {
      setSubmitting(false);
    }
  }

  const captionPreview = useMemo(() => data.scriptText, [data.scriptText]);

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#0b0b0f',
        color: 'white',
      }}
    >
      {/* top progress line — TikTok-style thin bar, driven by tracked watch time */}
      <div style={{ position: 'absolute', top: 0, insetInlineStart: 0, insetInlineEnd: 0, height: 3, background: 'rgba(255,255,255,0.15)', zIndex: 4 }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, watchProgress * 100)}%`,
            background: 'linear-gradient(90deg, var(--gold), #fff)',
            transition: 'width 0.6s linear',
          }}
        />
      </div>

      {/* level badge */}
      <div style={{ position: 'absolute', top: 14, insetInlineStart: 14, zIndex: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="badge badge-gold">{t('reels.level', { n: data.levelNumber })}</span>
        {data.completed && <span style={{ fontSize: 14 }}>{'⭐'.repeat(data.stars)}</span>}
      </div>

      {mode === 'watch' && (
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* full-bleed background */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 50% 38%, #241b3a, #0b0b0f 70%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => {
              if (stillWatchingActiveRef.current) {
                onConfirmStillWatching();
                return;
              }
              setPlaying((p) => !p);
            }}
          >
            {data.videoUrl ? (
              <video src={data.videoUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div
                style={{
                  fontSize: 92,
                  animation: playing ? 'spin 6s linear infinite' : 'none',
                  filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))',
                }}
              >
                {data.subjectIcon}
              </div>
            )}
          </div>

          {/* bottom scrim for text legibility */}
          <div
            style={{
              position: 'absolute',
              insetInlineStart: 0,
              insetInlineEnd: 0,
              bottom: 0,
              height: '46%',
              background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.85) 65%)',
              pointerEvents: 'none',
            }}
          />

          {/* right action rail — physical right side, matching TikTok across languages */}
          <div
            style={{
              position: 'absolute',
              right: 10,
              bottom: 110,
              zIndex: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 18,
            }}
          >
            <Avatar avatarKey={user?.avatarKey ?? 'falcon'} size={44} />

            <button
              type="button"
              onClick={() => {
                setLiked((v) => !v);
                setLikeCount((c) => c + (liked ? -1 : 1));
              }}
              style={{ background: 'none', border: 'none', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 30, transform: liked ? 'scale(1.15)' : 'scale(1)', transition: 'transform 0.15s' }}>
                {liked ? '❤️' : '🤍'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{likeCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('quiz')}
              style={{ background: 'none', border: 'none', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}
            >
              <span style={{ fontSize: 28 }}>📝</span>
              <span style={{ fontSize: 12, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{data.questions.length}</span>
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 26 }}>💎</span>
              <span style={{ fontSize: 12, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{t('reels.xpTag')}</span>
            </div>

            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'linear-gradient(150deg, var(--maroon-light), var(--maroon-dark))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                animation: playing ? 'spin 4s linear infinite' : 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                border: '2px solid rgba(255,255,255,0.25)',
              }}
            >
              {data.subjectIcon}
            </div>
          </div>

          {/* bottom-left info block */}
          <div style={{ position: 'absolute', insetInlineStart: 16, insetInlineEnd: 88, bottom: 20, zIndex: 3 }}>
            <span
              className="badge"
              style={{ background: 'rgba(255,255,255,0.18)', color: 'white', marginBottom: 8, backdropFilter: 'blur(6px)' }}
            >
              {data.subjectIcon} {data.subjectName}
            </span>
            <h2 style={{ color: 'white', fontSize: 19, margin: '2px 0 6px', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{data.title}</h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.92)',
                fontSize: 13.5,
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}
            >
              {captionPreview}
            </p>
            {!data.videoUrl && (
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11.5, marginTop: 6 }}>{t('reels.videoComingSoon')}</p>
            )}
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setMode('quiz')}>
              {t('reels.takeQuiz')}
            </button>
          </div>

          {isActive && stillWatchingActive && (
            <div
              className="swiper-no-swiping swiper-no-mousewheel"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 6,
                background: 'rgba(10,10,14,0.88)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: 28,
                gap: 14,
              }}
            >
              <span style={{ fontSize: 40 }}>👀</span>
              <h3 style={{ color: 'white', fontSize: 19, margin: 0 }}>{t('reels.stillWatchingTitle')}</h3>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13.5, maxWidth: 260, margin: 0 }}>
                {t('reels.stillWatchingBody')}
              </p>
              <button className="btn btn-primary" onClick={onConfirmStillWatching}>
                {t('reels.stillWatchingConfirm')}
              </button>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0 }}>
                {t('reels.stillWatchingCountdown', { n: stillWatchingCountdown })}
              </p>
            </div>
          )}
        </div>
      )}

      {mode === 'quiz' && (
        <div
          // swiper-no-swiping / swiper-no-mousewheel: dragging or wheel-scrolling through the
          // questions must not also be read as a swipe-to-next-reel gesture by the parent
          // Swiper — it uses two separate opt-out classes for touch/drag vs. wheel input.
          // no-scrollbar: still scrolls, just hides the visible scrollbar track/thumb.
          className="swiper-no-swiping swiper-no-mousewheel no-scrollbar"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(238,241,247,0.96)',
            backdropFilter: 'blur(22px) saturate(180%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%)',
            color: 'var(--ink)',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: '70px 16px 24px',
            borderRadius: '20px 20px 0 0',
          }}
        >
          {/* Lets the student back out of the quiz without submitting — they can reopen it
              any time from the "Take the Quiz" button, which just re-sets this same mode. */}
          <button
            type="button"
            aria-label={t('quiz.exit')}
            title={t('quiz.exit')}
            style={{
              position: 'absolute',
              top: 16,
              insetInlineEnd: 16,
              zIndex: 1,
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(0,0,0,0.08)',
              color: 'var(--ink)',
              fontSize: 17,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setMode('watch')}
          >
            ×
          </button>
          {error && <div className="form-error-banner">{error}</div>}
          <QuizCard questions={data.questions} onSubmit={handleSubmit} submitting={submitting} submitLabel={t('quiz.submit')} />
        </div>
      )}

      {mode === 'results' && result && (
        <div
          className="swiper-no-swiping swiper-no-mousewheel no-scrollbar"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(238,241,247,0.96)',
            backdropFilter: 'blur(22px) saturate(180%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%)',
            color: 'var(--ink)',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: '70px 16px 24px',
            borderRadius: '20px 20px 0 0',
          }}
        >
          <div className="stack">
            <div className="card text-center" style={{ background: 'var(--sand)' }}>
              <h2 style={{ fontSize: 22 }}>{t('reels.correctCount', { correct: result.correctCount, total: result.total })}</h2>
              <div style={{ fontSize: 26 }}>
                {'⭐'.repeat(result.stars)}
                {'☆'.repeat(3 - result.stars)}
              </div>
              <p className="badge badge-gold" style={{ fontSize: 15, marginTop: 8 }}>
                {t('common.xpGained', { xp: result.xpEarned })}
              </p>
            </div>
            <QuizResults questions={data.questions} results={result.results} />
            {hasNext && (
              <button className="btn btn-primary btn-block" onClick={onNext}>
                {t('reels.nextLesson')}
              </button>
            )}
          </div>
        </div>
      )}

      <LevelUpToast newLevel={levelUpValue} onDismiss={() => setLevelUpValue(null)} />
    </div>
  );
}
