import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { QuizCard, type QuizAnswer, type QuizQuestion } from './QuizCard';
import { QuizResults, type ResultItem } from './QuizResults';
import { LevelUpToast } from './LevelUpToast';
import { Avatar } from './Avatar';

export type ReelSlideData = {
  levelNumber: number;
  reelId: number;
  title: string;
  scriptText: string;
  videoUrl: string | null;
  subjectIcon: string;
  subjectName: string;
  // Only set for teacher-authored reels (null for seeded curriculum content, which has
  // no single author to credit).
  author: { displayName: string; avatarKey: string } | null;
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

export type ReelSlideControls = { openQuiz: () => void };

// After the active reel has looped this many times, assume the student may have wandered
// off (a real video, not the old page-wide 20-minute cumulative timer) and check in --
// short lesson clips looping 3x is a much more meaningful "have they actually left" signal
// than a long cross-reel timer would be.
const STILL_WATCHING_LOOP_THRESHOLD = 3;

export function ReelSlide({
  data,
  isActive,
  muted,
  onCompleted,
  onNext,
  hasNext,
  registerActiveControls,
}: {
  data: ReelSlideData;
  isActive: boolean;
  /** Page-level sound preference (see ReelsPage's action rail toggle). Every slide's video
   * stays muted regardless while inactive -- only the one active slide can ever have sound,
   * and even then only when the student has turned it on. */
  muted: boolean;
  onCompleted: (result: SubmitResult) => void;
  onNext: () => void;
  hasNext: boolean;
  /** While this slide is the active one, hand the page a way to open its quiz from the
   * external action rail (see ReelActionRail, rendered by ReelsPage). */
  registerActiveControls: (controls: ReelSlideControls | null) => void;
}) {
  const { t, lang } = useLanguage();
  const { refreshUser } = useAuth();
  const [mode, setMode] = useState<'watch' | 'quiz' | 'results'>('watch');
  const [playing, setPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [levelUpValue, setLevelUpValue] = useState<number | null>(null);
  const [watchProgress, setWatchProgress] = useState(0); // 0-1, real playback position of the video itself
  const [captionExpanded, setCaptionExpanded] = useState(false);
  // Whether the caption is long enough to be clipped in its collapsed (3-line) state — only
  // then is the See more / See less toggle shown. Measured from the rendered element.
  const [captionOverflows, setCaptionOverflows] = useState(false);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // This reel's own "are you still watching?" check -- local to this slide (not shared
  // across the feed) since it's driven by how many times *this* video has looped. No
  // auto-dismiss timer -- it waits for an explicit tap, however long that takes.
  const [stillWatching, setStillWatching] = useState(false);
  const loopCountRef = useRef(0);

  const pendingSecondsRef = useRef(0);

  // Latest values readable synchronously from inside the 1s tick / effect cleanups, which
  // otherwise only see the props from when they were set up (a stale closure).
  const stillWatchingRef = useRef(stillWatching);
  stillWatchingRef.current = stillWatching;
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
  // accrue XP.
  useEffect(() => {
    if (!isActive || mode !== 'watch') return;
    setPlaying(true);
    const tick = setInterval(() => {
      if (stillWatchingRef.current) return; // paused, waiting on this reel's own "still watching?" prompt
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      pendingSecondsRef.current += 1;
    }, 1000);
    return () => {
      clearInterval(tick);
      // Scrolling to another reel / opening the quiz / navigating away are all "I'm really
      // here" signals — commit what was watched. The one exception: this reel's own "still
      // watching?" prompt is up and unanswered (no auto-timeout -- it waits for a real tap),
      // in which case that stretch is left pending rather than rewarded unconfirmed.
      if (!stillWatchingRef.current) flushRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, mode]);

  // Pause the "playing" visuals while the prompt is up; resume once it's answered.
  useEffect(() => {
    setPlaying(!stillWatching && isActive && mode === 'watch');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillWatching]);

  function confirmStillWatching() {
    setStillWatching(false);
    loopCountRef.current = 0;
    flushRef.current();
    videoRef.current?.play().catch(() => {});
  }

  // The video has no `loop` attribute -- looping is driven manually here so the count is
  // observable. Every completed loop restarts playback immediately; every
  // STILL_WATCHING_LOOP_THRESHOLD-th loop instead pauses on the last frame and asks first.
  // Only the active slide counts loops or prompts -- inactive slides (Swiper keeps
  // neighbors mounted) just keep quietly looping in the background.
  function handleVideoEnded() {
    if (!isActive) {
      videoRef.current?.play().catch(() => {});
      return;
    }
    loopCountRef.current += 1;
    if (loopCountRef.current >= STILL_WATCHING_LOOP_THRESHOLD) {
      setStillWatching(true);
      return;
    }
    videoRef.current?.play().catch(() => {});
  }

  // Real top-bar timer, driven by the video's own currentTime/duration instead of a fixed
  // cosmetic estimate.
  function handleTimeUpdate(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget;
    if (v.duration && !Number.isNaN(v.duration)) {
      setWatchProgress(v.currentTime / v.duration);
    }
  }

  // While this is the active slide, let the external action rail open this reel's quiz.
  useEffect(() => {
    if (!isActive) return;
    registerActiveControls({ openQuiz: () => setMode('quiz') });
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

  // Scrolling away from a reel collapses its caption again, so it's back to the short form
  // the next time the student lands on it.
  useEffect(() => {
    if (!isActive) setCaptionExpanded(false);
  }, [isActive]);

  // Re-measure whether the collapsed caption is actually clipped (so we know to show the
  // toggle) whenever the text, language, or viewport changes. Skipped while expanded — the
  // element isn't clamped then, so there'd be nothing to measure.
  useLayoutEffect(() => {
    const el = captionRef.current;
    if (!el || captionExpanded) return;
    const measure = () => setCaptionOverflows(el.scrollHeight - el.clientHeight > 2);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [captionPreview, lang, captionExpanded]);

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
        <span className="badge badge-gold">
          {data.levelNumber < 0 ? t('reels.bonusLesson') : t('reels.level', { n: data.levelNumber })}
        </span>
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
              if (stillWatchingRef.current) {
                confirmStillWatching();
                return;
              }
              setPlaying((p) => {
                const next = !p;
                if (videoRef.current) {
                  if (next) videoRef.current.play().catch(() => {});
                  else videoRef.current.pause();
                }
                return next;
              });
            }}
          >
            {data.videoUrl ? (
              <video
                ref={videoRef}
                src={data.videoUrl}
                autoPlay
                muted={muted || !isActive}
                playsInline
                onEnded={handleVideoEnded}
                onTimeUpdate={handleTimeUpdate}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
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

          {/* bottom info block — the like/quiz/XP action rail now lives outside the reel frame
              (see ReelActionRail, rendered by ReelsPage), so this only needs to clear its own
              padding, not reserved space for an overlay. */}
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 20, zIndex: 3 }}>
            <span
              className="badge"
              style={{ background: 'rgba(255,255,255,0.18)', color: 'white', marginBottom: 8, backdropFilter: 'blur(6px)' }}
            >
              {data.subjectIcon} {data.subjectName}
            </span>
            <h2 style={{ color: 'white', fontSize: 19, margin: '2px 0 6px', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{data.title}</h2>
            {data.author && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Avatar avatarKey={data.author.avatarKey} size={22} />
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                  {t('reels.lessonBy', { name: data.author.displayName })}
                </span>
              </div>
            )}
            <p
              ref={captionRef}
              className={captionExpanded ? 'no-scrollbar swiper-no-swiping swiper-no-mousewheel' : undefined}
              style={{
                color: 'rgba(255,255,255,0.92)',
                fontSize: 13.5,
                lineHeight: 1.4,
                margin: 0,
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                ...(captionExpanded
                  ? { maxHeight: '32vh', overflowY: 'auto', overscrollBehavior: 'contain' }
                  : {
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }),
              }}
            >
              {captionPreview}
            </p>
            {(captionOverflows || captionExpanded) && (
              <button
                type="button"
                onClick={() => setCaptionExpanded((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginTop: 4,
                  color: 'rgba(255,255,255,0.75)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                }}
              >
                {captionExpanded ? t('reels.seeLess') : t('reels.seeMore')}
              </button>
            )}
            {!data.videoUrl && (
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11.5, marginTop: 6 }}>{t('reels.videoComingSoon')}</p>
            )}
            {data.questions.length > 0 ? (
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setMode('quiz')}>
                {t('reels.takeQuiz')}
              </button>
            ) : (
              hasNext && (
                <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onNext}>
                  {t('reels.nextLesson')}
                </button>
              )
            )}
          </div>

          {isActive && stillWatching && (
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
              <button className="btn btn-primary" onClick={confirmStillWatching}>
                {t('reels.stillWatchingConfirm')}
              </button>
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
