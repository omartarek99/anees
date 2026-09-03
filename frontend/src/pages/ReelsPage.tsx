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

// The "are you still watching?" check fires once per 20 minutes of genuine watch time spent
// on the Reels page (it only advances while a reel is actually playing in view, and resets
// when the student leaves the page). If they don't confirm within 10 seconds, the watch time
// from that 20-minute stretch is dropped instead of counted toward XP.
const STILL_WATCHING_INTERVAL_SECONDS = 20 * 60;
const STILL_WATCHING_TIMEOUT_SECONDS = 10;

type MapLevel = {
  levelNumber: number;
  title: string;
  kind: 'normal' | 'boss';
  status: 'ready' | 'coming_soon';
  subject: { key: string; name: string; icon: string } | null;
  progress: { status: 'locked' | 'available' | 'completed'; stars: number };
};

type ReelDetailResponse = {
  comingSoon: boolean;
  level: { levelNumber: number; title: string; titleAr?: string | null; kind: string };
  subject: { key: string; name: string; nameAr?: string | null; icon: string };
  reel: { id: number; title: string; titleAr?: string | null; scriptText: string; scriptTextAr?: string | null; videoUrl: string | null };
  questions: { id: number; text: string; textAr?: string | null; choices: string[]; choicesAr?: string[] | null; order: number }[];
  progress: { status: 'locked' | 'available' | 'completed'; stars: number };
};

export function ReelsPage() {
  const { refreshUser } = useAuth();
  const { t, lang } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rawDetails, setRawDetails] = useState<ReelDetailResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null until Swiper reports a real slide-change event — see `initialIndex` fallback below.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const swiperRef = useRef<SwiperClass | null>(null);

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
        questions: [...detail.questions]
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

  async function fetchPlayableDetails(excludeLevels: Set<number> = new Set()): Promise<ReelDetailResponse[]> {
    const mapData = await api.get<{ levels: MapLevel[] }>('/map');
    const playable = mapData.levels.filter(
      (l) => l.kind === 'normal' && l.status === 'ready' && l.progress.status !== 'locked' && !excludeLevels.has(l.levelNumber)
    );
    const details = await Promise.all(playable.map((l) => api.get<ReelDetailResponse>(`/reels/level/${l.levelNumber}`)));
    return details.filter((d) => !d.comingSoon);
  }

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      setRawDetails(await fetchPlayableDetails());
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
      const existing = new Set(rawDetails.map((d) => d.level.levelNumber));
      const freshDetails = await fetchPlayableDetails(existing);
      if (freshDetails.length > 0) setRawDetails((prev) => [...prev, ...freshDetails]);
      // Sync completed/star state for the whole feed (covers the just-completed slide too).
      const mapData = await api.get<{ levels: MapLevel[] }>('/map');
      setRawDetails((prev) =>
        prev.map((d) => {
          const match = mapData.levels.find((l) => l.levelNumber === d.level.levelNumber);
          return match ? { ...d, progress: { status: match.progress.status, stars: match.progress.stars } } : d;
        })
      );
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

  return (
    <div>
      <div className="text-center muted" style={{ fontSize: 13, marginBottom: 10 }}>
        {t('reels.swipeHint')}
      </div>
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
          height: 'calc(100vh - 160px)',
          maxWidth: 460,
          margin: '0 auto',
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
  );
}
