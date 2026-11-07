import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { PointsInfoModal } from '../components/PointsInfoModal';

/** No backend "like" concept exists -- likes are cosmetic, session-local gamification
 * only, so every reel (new upload or existing) always starts at 0. */
const initialLikeCount = () => 0;

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
    author: { username: string; displayName: string; avatarKey: string; avatarUrl: string | null; rankKey?: string } | null;
    questions: { id: number; text: string; textAr?: string | null; choices: string[]; choicesAr?: string[] | null; order: number }[];
  };
  progress: { status: 'locked' | 'available' | 'completed'; stars: number };
};

/** The slide in view and its neighbours (round the loop) are the only ones that get a <video>. */
function isNearActive(i: number, active: number, total: number): boolean {
  const d = Math.abs(i - active);
  return Math.min(d, total - d) <= 1;
}

export function ReelsPage() {
  const { refreshUser } = useAuth();
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
  const toggleLike = useCallback((reelId: number) => {
    setLikes((prev) => {
      const cur = prev[reelId] ?? { liked: false, count: initialLikeCount() };
      return { ...prev, [reelId]: { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) } };
    });
  }, []);

  // Sound preference persists across swipes (TikTok-style) rather than resetting per slide.
  // Starts with the sound ON. A browser only lets a video start with sound after the person has touched the page (so on a fresh load of
  // /reels -- a reload, a bookmark -- it refuses): ReelSlide then reports it (onSoundBlocked), the video plays muted instead, and the first tap
  // anywhere on the page switches the sound on. Coming from another page of the app (a click already happened) it just plays with sound.
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const toggleMute = useCallback(() => {
    setSoundBlocked(false);
    setMuted((m) => !m);
  }, []);
  const handleSoundBlocked = useCallback(() => {
    setMuted(true);
    setSoundBlocked(true);
  }, []);
  useEffect(() => {
    if (!soundBlocked) return;
    // The sound comes on at the first touch of any kind. iPhone Safari only counts a touch END (or a click) as the permission to play with sound, not
    // the touch start, and only lets the sound be switched on inside that same event: so the playing video is unmuted right here, synchronously,
    // as well as through React state (which lands a moment later, outside the event).
    let done = false;
    const unmute = (e: Event) => {
      // the speaker button handles its own tap
      if (done || (e.target as Element | null)?.closest?.('[data-sound-toggle]')) return;
      done = true;
      document.querySelectorAll<HTMLVideoElement>('.swiper-slide-active video').forEach((v) => {
        v.muted = false;
        void v.play().catch(() => {});
      });
      setSoundBlocked(false);
      setMuted(false);
    };
    const events = ['pointerup', 'touchend', 'click', 'keydown'] as const;
    for (const ev of events) window.addEventListener(ev, unmute, { capture: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, unmute, { capture: true });
    };
  }, [soundBlocked]);

  // The action rail's diamond opens this -- a quick explainer of how points work.
  const [pointsInfoOpen, setPointsInfoOpen] = useState(false);

  // Controls for whichever ReelSlide is currently active — lets the external action rail
  // open that slide's quiz (each slide's own "are you still watching?" check, driven by its
  // own loop count, is otherwise fully self-contained -- see ReelSlide).
  const activeControlsRef = useRef<ReelSlideControls | null>(null);

  const registerActiveControls = useCallback((controls: ReelSlideControls | null) => {
    activeControlsRef.current = controls;
  }, []);

  // Deep-link support (e.g. a Map-page "Watch the lesson" link with ?level=N): captured once
  // on mount, then handed to Swiper as `initialSlide` so it starts on the right slide from
  // its very first render — no post-mount imperative jump needed.
  const [deepLinkLevel] = useState(() => {
    const level = searchParams.get('level');
    return level ? Number(level) : null;
  });

  // Only lessons with a video are in the feed (no placeholder reels), and ones whose file turned out not to exist (deleted from the storage, a
  // broken link) are left out for the rest of the visit, so a student only ever scrolls through reels that play.
  const [brokenIds, setBrokenIds] = useState<number[]>([]);
  const handleVideoFailed = useCallback((reelId: number) => setBrokenIds((b) => (b.includes(reelId) ? b : [...b, reelId])), []);

  const slides: ReelSlideData[] = useMemo(
    () =>
      rawDetails.filter((detail) => !!detail.reel.videoUrl && !brokenIds.includes(detail.reel.id)).map((detail) => ({
        levelNumber: detail.level.levelNumber,
        reelId: detail.reel.id,
        title: pickText(lang, detail.reel.title, detail.reel.titleAr),
        scriptText: pickText(lang, detail.reel.scriptText, detail.reel.scriptTextAr),
        videoUrl: detail.reel.videoUrl,
        subjectIcon: detail.subject.icon,
        subjectKey: detail.subject.key,
        subjectName: pickText(lang, detail.subject.name, detail.subject.nameAr),
        author: detail.reel.author,
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
    [rawDetails, lang, brokenIds]
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
    try {
      // One request covers both jobs the old code needed two round trips for: fresh
      // progress/stars on reels already in the feed, and any reel the completion just
      // unlocked. Existing entries keep their position (so the Swiper doesn't jump); newly
      // unlocked ones are appended. Keyed by reel id, not level number -- a level can now
      // hold several reels (the seeded lesson plus any teacher ones).
      // Fetched alongside refreshUser (two independent GETs) rather than after it.
      const [, feed] = await Promise.all([refreshUser(), api.get<FlatReelEntry[]>('/reels/feed')]);
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

  // Nothing to watch yet (lessons come from teachers' uploads): say so and point at what is there, rather than showing a blank frame.
  if (slides.length === 0) {
    return (
      <div className="empty-state card stack" style={{ maxWidth: 520, margin: '40px auto' }}>
        <h2>{t('reels.emptyTitle')}</h2>
        <p>{t('reels.emptyBody')}</p>
        <div className="flex-center gap-md" style={{ flexWrap: 'wrap' }}>
          <Link to="/map" className="btn btn-primary">
            {t('home.openMap')}
          </Link>
          <Link to="/worksheets" className="btn btn-secondary">
            {t('nav.worksheets')}
          </Link>
        </div>
      </div>
    );
  }

  // the slide in view, kept inside the list when a lesson has just been dropped from it
  const current = Math.min(activeIndex ?? initialIndex, Math.max(0, slides.length - 1));
  const activeSlide = slides[current] as ReelSlideData | undefined;
  const activeLike = activeSlide ? likes[activeSlide.reelId] ?? { liked: false, count: initialLikeCount() } : null;

  return (
    // Cancels .app-main's own padding (20px/24px/96px) so this page -- and only this page --
    // gets to use the full viewport height for the frame below, TikTok-style, instead of
    // sitting in a shorter box with a lot of dead space above and below it.
    <div className="reels-bleed">
      {/* `direction: ltr` here keeps the action rail on the physical right of the frame in both
          languages (matching TikTok, which never mirrors its action rail for RTL) — the inner
          wrapper resets back to the real page direction so the reel's own caption/badge/exit-
          button logical-property layout still mirrors correctly for Arabic. */}
      <div className="reels-frame-row flex-center gap-md" style={{ direction: 'ltr' }}>
        <div style={{ direction: dir, width: 'min(100%, 560px)', height: '100%', position: 'relative' }}>
        {/* Floating overlay instead of a block above the frame -- doesn't eat into the
            frame's own height budget. */}
        <div
          className="text-center reels-swipe-hint"
          style={{
            position: 'absolute',
            top: 10,
            insetInlineStart: 0,
            insetInlineEnd: 0,
            zIndex: 2,
            fontSize: 12.5,
            color: 'rgba(255,255,255,0.75)',
            textShadow: '0 1px 4px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}
        >
          {t('reels.swipeHint')}
        </div>
        <Swiper
          key={slides.length}
          direction="vertical"
          loop={loopEnabled}
          initialSlide={current}
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
            height: '100%',
            width: '100%',
            background: '#0b0b0f',
          }}
        >
          {slides.map((slide, i) => (
            <SwiperSlide key={slide.reelId}>
              <ReelSlide
                data={slide}
                isActive={i === (current)}
                loadVideo={isNearActive(i, current, slides.length)}
                preloadNext={i === ((current) + 1) % slides.length}
                muted={muted}
                onSoundBlocked={handleSoundBlocked}
                onCompleted={handleCompleted}
                onNext={() => swiperRef.current?.slideNext()}
                onVideoFailed={handleVideoFailed}
                hasNext={loopEnabled}
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
            author={activeSlide.author}
            liked={activeLike.liked}
            likeCount={activeLike.count}
            onToggleLike={() => toggleLike(activeSlide.reelId)}
            questionCount={activeSlide.questions.length}
            onOpenQuiz={() => activeControlsRef.current?.openQuiz()}
            onOpenPointsInfo={() => setPointsInfoOpen(true)}
            muted={muted}
            onToggleMute={toggleMute}
          />
        )}
        <PointsInfoModal open={pointsInfoOpen} onClose={() => setPointsInfoOpen(false)} />
      </div>
    </div>
  );
}
