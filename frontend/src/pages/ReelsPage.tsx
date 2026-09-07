import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperClass } from 'swiper';
import 'swiper/css';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { ReelSlide, type ReelSlideData, type ReelSlideControls } from '../components/ReelSlide';
import { ReelActionRail } from '../components/ReelActionRail';

/** Fake-but-stable like counts (no backend "like" concept exists — this is cosmetic
 * gamification only), seeded from the level number so the same reel always starts at the
 * same count. */
const initialLikeCount = (levelNumber: number) => 40 + ((levelNumber * 17) % 260);

// The "are you still watching?" check fires once per 20 minutes of genuine watch time spent
// on the Reels page (it only advances while a reel is actually playing in view, and resets
// when the student leaves the page). If they don't confirm within 10 seconds, the watch time
// from that 20-minute stretch is dropped instead of counted toward XP.
const STILL_WATCHING_INTERVAL_SECONDS = 20 * 60;
const STILL_WATCHING_TIMEOUT_SECONDS = 10;

// One flattened entry per reel, exactly as GET /reels/feed returns it — a level can have
// several reels (the seeded lesson plus any teacher ones), and grade-based teacher reels
// (no map level at all) arrive with a synthetic negative `level.levelNumber` (see
// backend/src/routes/reels.ts) so they can never collide with a real level's entries.
type FlatReelEntry = {
  comingSoon: boolean;
  level: { levelNumber: number; title: string; titleAr?: string | null; kind: string };
  subject: { key: string; name: string; nameAr?: string | null; icon: string };
  reel: {
    id: number;
    title: string;
    titleAr?: string | null;
    scriptText: string;
    scriptTextAr?: string | null;
    videoUrl: string | null;
    questions: { id: number; text: string; textAr?: string | null; choices: string[]; choicesAr?: string[] | null; order: number }[];
  };
  progress: { status: 'locked' | 'available' | 'completed'; stars: number };
};

export function ReelsPage() {
  const { user, refreshUser } = useAuth();
  const { t, lang, dir } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rawDetails, setRawDetails] = useState<FlatReelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null until Swiper reports a real slide-change event — see `initialIndex` fallback below.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const swiperRef = useRef<SwiperClass | null>(null);

  // Like state lives here (outside ReelSlide) keyed by reel id, since the action rail that
  // displays/toggles it now renders once, outside the Swiper frame, rather than per-slide.
  const [likes, setLikes] = useState<Record<number, { liked: boolean; count: number }>>({});
  const toggleLike = useCallback((reelId: number, levelNumber: number) => {
    setLikes((prev) => {
      const cur = prev[reelId] ?? { liked: false, count: initialLikeCount(levelNumber) };
      return { ...prev, [reelId]: { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) } };
    });
  }, []);

  // Sound preference persists across swipes (TikTok-style) rather than resetting per slide.
  // Starts muted -- browsers require that for <video autoPlay> to work without a user gesture;
  // the action rail's speaker button is the first real gesture that can turn it on.
  const [muted, setMuted] = useState(true);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  // ---- page-level "are you still watching?" engagement check ----
  const [stillWatching, setStillWatching] = useState(false);
  const [swCountdown, setSwCountdown] = useState(STILL_WATCHING_TIMEOUT_SECONDS);
  const engagedSecondsRef = useRef(0);
  const stillWatchingRef = useRef(false);
  // Controls for whichever ReelSlide is currently active — lets us flush or drop its
  // un-committed watch seconds when the prompt is answered or ignored.
  const activeControlsRef = useRef<ReelSlideControls | null>(null);

  const registerActiveControls = useCallback((controls: ReelSlideControls | null) => {
    activeControlsRef.current = controls;
  }, []);

  // Called once per genuinely-watched second by the active slide.
  const reportWatchSecond = useCallback(() => {
    if (stillWatchingRef.current) return;
    engagedSecondsRef.current += 1;
    if (engagedSecondsRef.current >= STILL_WATCHING_INTERVAL_SECONDS) {
      stillWatchingRef.current = true;
      setStillWatching(true);
    }
  }, []);

  function endStillWatching(counts: boolean) {
    engagedSecondsRef.current = 0;
    stillWatchingRef.current = false;
    if (counts) activeControlsRef.current?.commit();
    else activeControlsRef.current?.discard();
    setStillWatching(false);
  }
  const confirmStillWatching = () => endStillWatching(true);

  // Auto-dismiss-as-"not watching" countdown, Netflix-style — paused while the tab is hidden
  // so a backgrounded tab doesn't burn the 10 seconds before the student can answer.
  useEffect(() => {
    if (!stillWatching) return;
    let remaining = STILL_WATCHING_TIMEOUT_SECONDS;
    setSwCountdown(remaining);
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(iv);
        endStillWatching(false);
      } else {
        setSwCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillWatching]);

  // Deep-link support (e.g. a Map-page "Watch the lesson" link with ?level=N): captured once
  // on mount, then handed to Swiper as `initialSlide` so it starts on the right slide from
  // its very first render — no post-mount imperative jump needed.
  const [deepLinkLevel] = useState(() => {
    const level = searchParams.get('level');
    return level ? Number(level) : null;
  });

  const slides: ReelSlideData[] = useMemo(
    () =>
      rawDetails.map((detail) => ({
        levelNumber: detail.level.levelNumber,
        reelId: detail.reel.id,
        title: pickText(lang, detail.reel.title, detail.reel.titleAr),
        scriptText: pickText(lang, detail.reel.scriptText, detail.reel.scriptTextAr),
        videoUrl: detail.reel.videoUrl,
        subjectIcon: detail.subject.icon,
        subjectName: pickText(lang, detail.subject.name, detail.subject.nameAr),
        questions: [...detail.reel.questions]
          .sort((a, b) => a.order - b.order)
          .map((q) => ({
            id: q.id,
            text: pickText(lang, q.text, q.textAr),
            choices: lang === 'ar' && q.choicesAr ? q.choicesAr : q.choices,
          })),
        completed: detail.progress.status === 'completed',
        stars: detail.progress.stars,
      })),
    [rawDetails, lang]
  );

  // Swiper's own `loop` mode gives us the endless-feed behavior for free (it clones slides
  // internally for seamless wraparound) — no need to manually duplicate laps of data.
  const loopEnabled = slides.length > 1;

  const initialIndex = useMemo(() => {
    if (deepLinkLevel === null) return 0;
    const index = slides.findIndex((s) => s.levelNumber === deepLinkLevel);
    return index === -1 ? 0 : index;
  }, [slides, deepLinkLevel]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      setRawDetails(await api.get<FlatReelEntry[]>('/reels/feed'));
      setError(null);
    } catch {
      setError(t('reels.loadError'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // The deep-link level was captured into state on mount; drop it from the URL right away so
  // it doesn't re-trigger anything on a later re-render.
  useEffect(() => {
    if (deepLinkLevel !== null) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCompleted() {
    await refreshUser();
    try {
      // One request covers both jobs the old code needed two round trips for: fresh
      // progress/stars on reels already in the feed, and any reel the completion just
      // unlocked. Existing entries keep their position (so the Swiper doesn't jump); newly
      // unlocked ones are appended. Keyed by reel id, not level number -- a level can now
      // hold several reels (the seeded lesson plus any teacher ones).
      const feed = await api.get<FlatReelEntry[]>('/reels/feed');
      const byReelId = new Map(feed.map((d) => [d.reel.id, d]));
      setRawDetails((prev) => {
        const refreshed = prev.map((d) => byReelId.get(d.reel.id) ?? d);
        const known = new Set(prev.map((d) => d.reel.id));
        const newlyUnlocked = feed.filter((d) => !known.has(d.reel.id));
        return [...refreshed, ...newlyUnlocked];
      });
    } catch {
      // feed will resync on next visit
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return <div className="form-error-banner">{error}</div>;
  }

  const activeSlide = slides[activeIndex ?? initialIndex] as ReelSlideData | undefined;
  const activeLike = activeSlide ? likes[activeSlide.reelId] ?? { liked: false, count: initialLikeCount(activeSlide.levelNumber) } : null;

  return (
    <div>
      <div className="text-center muted" style={{ fontSize: 13, marginBottom: 10 }}>
        {t('reels.swipeHint')}
      </div>
      {/* `direction: ltr` here keeps the action rail on the physical right of the frame in both
          languages (matching TikTok, which never mirrors its action rail for RTL) — the inner
          wrapper resets back to the real page direction so the reel's own caption/badge/exit-
          button logical-property layout still mirrors correctly for Arabic. */}
      <div className="flex-center gap-md" style={{ alignItems: 'flex-end', direction: 'ltr' }}>
        <div style={{ direction: dir, width: 'min(100%, 560px)' }}>
        <Swiper
          direction="vertical"
          loop={loopEnabled}
          initialSlide={initialIndex}
          modules={[Mousewheel]}
          mousewheel={{ forceToAxis: true }}
          // A reel never has to finish playing before the student can move on — swiping (or
          // scrolling) to the next lesson is always available in watch mode; only the quiz/
          // results overlays opt out via the swiper-no-swiping/-mousewheel classes above.
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
          onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
          style={{
            height: 'calc(100vh - 130px)',
            width: '100%',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            background: '#0b0b0f',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {slides.map((slide, i) => (
            <SwiperSlide key={slide.reelId}>
              <ReelSlide
                data={slide}
                isActive={i === (activeIndex ?? initialIndex)}
                muted={muted}
                onCompleted={handleCompleted}
                onNext={() => swiperRef.current?.slideNext()}
                hasNext={loopEnabled}
                stillWatchingActive={stillWatching}
                stillWatchingCountdown={swCountdown}
                onConfirmStillWatching={confirmStillWatching}
                onWatchSecond={reportWatchSecond}
                registerActiveControls={registerActiveControls}
              />
            </SwiperSlide>
          ))}
        </Swiper>
        </div>

        {/* Action rail lives outside the reel frame (TikTok-desktop style), always reflecting
            whichever slide is currently active. */}
        {activeSlide && activeLike && (
          <ReelActionRail
            avatarKey={user?.avatarKey ?? 'falcon'}
            liked={activeLike.liked}
            likeCount={activeLike.count}
            onToggleLike={() => toggleLike(activeSlide.reelId, activeSlide.levelNumber)}
            questionCount={activeSlide.questions.length}
            onOpenQuiz={() => activeControlsRef.current?.openQuiz()}
            subjectIcon={activeSlide.subjectIcon}
            muted={muted}
            onToggleMute={toggleMute}
          />
        )}
      </div>
    </div>
  );
}
