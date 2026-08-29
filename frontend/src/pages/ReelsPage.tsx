import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { ReelSlide, type ReelSlideData } from '../components/ReelSlide';

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

// How many upcoming slides must remain before we extend the feed with another lap —
// keeps the scroll seamless, since growth happens well before the student reaches the end.
const GROW_WHEN_WITHIN = 3;

export function ReelsPage() {
  const { refreshUser } = useAuth();
  const { t, lang } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rawDetails, setRawDetails] = useState<ReelDetailResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [laps, setLaps] = useState(1);
  const slideRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const pendingScrollLevel = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const baseSlides: ReelSlideData[] = useMemo(
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

  // The rendered feed loops the student's unlocked levels endlessly instead of dead-ending —
  // each lap gets its own key suffix so React (and the ref map) can tell repeats apart.
  const renderedSlides = useMemo(() => {
    if (baseSlides.length === 0) return [];
    const items: { key: string; lap: number; data: ReelSlideData }[] = [];
    for (let lap = 0; lap < laps; lap++) {
      for (const slide of baseSlides) {
        items.push({ key: `${slide.levelNumber}#${lap}`, lap, data: slide });
      }
    }
    return items;
  }, [baseSlides, laps]);

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
      const details = await fetchPlayableDetails();
      setRawDetails(details);
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

  useEffect(() => {
    const levelParam = searchParams.get('level');
    if (levelParam) pendingScrollLevel.current = Number(levelParam);
  }, [searchParams]);

  useEffect(() => {
    if (pendingScrollLevel.current !== null && baseSlides.some((s) => s.levelNumber === pendingScrollLevel.current)) {
      const el = slideRefs.current.get(`${pendingScrollLevel.current}#0`);
      el?.scrollIntoView({ behavior: 'auto' });
      pendingScrollLevel.current = null;
      setSearchParams({}, { replace: true });
    }
  }, [baseSlides, setSearchParams]);

  // Tracks which slide is actually in view so only that one accrues watch-time XP —
  // scrolled-past slides stop ticking immediately. Driven by scroll position (layout-only)
  // rather than IntersectionObserver, since the latter depends on the document actually
  // painting and can silently never fire in some rendering states.
  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || renderedSlides.length === 0) return;

    function computeActive() {
      const containerEl = root!;
      const center = containerEl.scrollTop + containerEl.clientHeight / 2;
      let best: { key: string; dist: number } | null = null;
      for (const item of renderedSlides) {
        const el = slideRefs.current.get(item.key);
        if (!el) continue;
        const mid = el.offsetTop + el.offsetHeight / 2;
        const dist = Math.abs(mid - center);
        if (!best || dist < best.dist) best = { key: item.key, dist };
      }
      if (best) setActiveKey(best.key);
    }

    computeActive();
    root.addEventListener('scroll', computeActive, { passive: true });
    return () => root.removeEventListener('scroll', computeActive);
  }, [renderedSlides]);

  // Extends the feed with another lap once the student scrolls near the end of the current one.
  useEffect(() => {
    if (!activeKey || renderedSlides.length === 0) return;
    const idx = renderedSlides.findIndex((item) => item.key === activeKey);
    if (idx !== -1 && idx >= renderedSlides.length - GROW_WHEN_WITHIN) {
      setLaps((l) => l + 1);
    }
  }, [activeKey, renderedSlides]);

  async function handleCompleted() {
    await refreshUser();
    try {
      const existing = new Set(rawDetails.map((d) => d.level.levelNumber));
      const freshDetails = await fetchPlayableDetails(existing);
      if (freshDetails.length > 0) {
        setRawDetails((prev) => [...prev, ...freshDetails]);
      }
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

  function scrollToNext() {
    if (!activeKey) return;
    const idx = renderedSlides.findIndex((item) => item.key === activeKey);
    const next = renderedSlides[idx + 1];
    if (next) slideRefs.current.get(next.key)?.scrollIntoView({ behavior: 'smooth' });
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
      <div
        ref={scrollContainerRef}
        style={{
          height: 'calc(100vh - 160px)',
          maxWidth: 460,
          margin: '0 auto',
          overflowY: 'auto',
          scrollSnapType: 'y mandatory',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          background: '#0b0b0f',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {renderedSlides.map((item) => (
          <ReelSlide
            key={item.key}
            ref={(el) => {
              slideRefs.current.set(item.key, el);
              if (el) el.dataset.slideKey = item.key;
            }}
            data={item.data}
            isReplay={item.lap > 0}
            isActive={item.key === activeKey}
            onCompleted={handleCompleted}
            onNext={scrollToNext}
            hasNext
          />
        ))}
      </div>
    </div>
  );
}
