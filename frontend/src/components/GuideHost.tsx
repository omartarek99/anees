import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
  RiHome2Line,
  RiVideoFill,
  RiMapFill,
  RiGamepadLine,
  RiFilePaper2Line,
  RiBarChartBoxFill,
  RiGroupFill,
  RiUserFill,
  RiMovie2Line,
  RiFilmFill,
  RiCertificateFill,
} from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { GUIDE_EVENT, PAGE_IDS, finishTour, guideEnabled, markPageSeen, pageSeen, tourDone, tourStops, type TourStop } from '../lib/guide';

// First-run guide for new accounts (rules in lib/guide.ts): a welcome card, then each icon in the menu bar is lit
// up with a shadowed pop-out that says what it is, then -- the first time a page is opened -- a short window
// describing that page. Mounted once in the signed-in layout (App.tsx).

const PAGE_ICONS: Record<string, ReactNode> = {
  home: <RiHome2Line size={28} />,
  reels: <RiVideoFill size={28} />,
  map: <RiMapFill size={28} />,
  craft: <RiGamepadLine size={28} />,
  worksheets: <RiFilePaper2Line size={28} />,
  leaderboard: <RiBarChartBoxFill size={28} />,
  friends: <RiGroupFill size={28} />,
  profile: <RiUserFill size={28} />,
  myReels: <RiMovie2Line size={28} />,
  adminReports: <RiBarChartBoxFill size={28} />,
  adminUsers: <RiGroupFill size={28} />,
  adminVideos: <RiFilmFill size={28} />,
  adminCertificates: <RiCertificateFill size={28} />,
};

type Tr = (key: string, vars?: Record<string, string | number>) => string;
function useGuideText(): Tr {
  const { t } = useLanguage();
  return (key, vars) => (t as unknown as Tr)(`guide.${key}`, vars);
}

function Welcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const g = useGuideText();
  return createPortal(
    <div className="guide-layer guide-layer--dim" role="dialog" aria-modal="true" aria-labelledby="guide-welcome-title">
      <div className="guide-card">
        <img className="guide-logo" src="/icons/logo-mark.png" alt="" width={64} height={64} />
        <h3 id="guide-welcome-title">{g('welcomeTitle')}</h3>
        <p>{g('welcomeBody')}</p>
        <button type="button" className="guide-primary guide-block" onClick={onStart} autoFocus>
          {g('start')}
        </button>
        <button type="button" className="guide-link" onClick={onSkip}>
          {g('skipNow')}
        </button>
      </div>
    </div>,
    document.body
  );
}

type PopPlacement = { top: number; left: number; side: 'top' | 'start' | 'end'; arrow: number };

function Steps({ stops, index, setIndex, onEnd }: { stops: TourStop[]; index: number; setIndex: (i: number) => void; onEnd: () => void }) {
  const { t } = useLanguage();
  const g = useGuideText();
  const stop = stops[index];
  const last = index === stops.length - 1;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pop, setPop] = useState<PopPlacement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${stop.target}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  }, [stop.target]);

  // Find the icon; skip the step if it is not on screen (for example a link this account does not have).
  useEffect(() => {
    const r = measure();
    if (!r) {
      if (index < stops.length - 1) setIndex(index + 1);
      else onEnd();
      return;
    }
    setRect(r);
    setPop(null);
    const update = () => {
      const next = measure();
      if (next) setRect(next);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, measure]);

  // Place the pop-out next to the icon: above it on a phone (bottom tab bar), beside it on the side bar.
  useLayoutEffect(() => {
    if (!rect || !popRef.current) return;
    const w = popRef.current.offsetWidth;
    const h = popRef.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 18;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    if (cy > vh * 0.55) {
      const left = clamp(cx - w / 2, 16, vw - w - 16);
      setPop({ top: rect.top - 6 - gap - h, left, side: 'top', arrow: clamp(cx - left, 24, w - 24) });
    } else if (cx < vw / 2) {
      const top = clamp(cy - h / 2, 16, vh - h - 16);
      setPop({ top, left: rect.right + 6 + gap, side: 'end', arrow: clamp(cy - top, 24, h - 24) });
    } else {
      const top = clamp(cy - h / 2, 16, vh - h - 16);
      setPop({ top, left: rect.left - 6 - gap - w, side: 'start', arrow: clamp(cy - top, 24, h - 24) });
    }
  }, [rect, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onEnd();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEnd]);

  if (!rect) return null;
  const title = stop.id === 'menu' ? t('common.menu') : t(`nav.${stop.id}` as 'nav.home');
  const width = Math.min(320, window.innerWidth - 32);

  return createPortal(
    <div className="guide-layer" role="dialog" aria-modal="true" aria-label={g('tourLabel')}>
      <div className="guide-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />
      <div
        ref={popRef}
        className="guide-pop"
        data-side={pop?.side ?? 'top'}
        style={{ width, top: pop?.top ?? -9999, left: pop?.left ?? -9999, visibility: pop ? 'visible' : 'hidden', ['--arrow' as string]: `${pop?.arrow ?? 0}px` }}
      >
        <span className="guide-arrow" aria-hidden="true" />
        <span className="guide-chip">{g('stepOf', { n: index + 1, total: stops.length })}</span>
        <h3>{title}</h3>
        <p>{g(`step_${stop.id}`)}</p>
        <div className="guide-actions">
          <button type="button" className="guide-link" onClick={onEnd}>
            {g('skip')}
          </button>
          <span className="guide-grow" />
          {index > 0 && (
            <button type="button" className="guide-ghost" onClick={() => setIndex(index - 1)}>
              {g('back')}
            </button>
          )}
          <button type="button" className="guide-primary" onClick={() => (last ? onEnd() : setIndex(index + 1))} autoFocus>
            {last ? g('finish') : g('next')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PageIntro({ id, onClose }: { id: string; onClose: () => void }) {
  const g = useGuideText();
  const { t } = useLanguage();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const title = id === 'profile' ? g('profileTitle') : t(`nav.${id}` as 'nav.home');
  return createPortal(
    <div className="guide-layer guide-layer--dim" role="dialog" aria-modal="true" aria-labelledby="guide-intro-title" onClick={onClose}>
      <div className="guide-card" onClick={(e) => e.stopPropagation()}>
        <span className="guide-icon" aria-hidden="true">
          {PAGE_ICONS[id]}
        </span>
        <h3 id="guide-intro-title">{title}</h3>
        <p>{g(`page_${id}`)}</p>
        <button type="button" className="guide-primary guide-block" onClick={onClose} autoFocus>
          {g('gotIt')}
        </button>
      </div>
    </div>,
    document.body
  );
}

export function GuideHost() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [phase, setPhase] = useState<'idle' | 'welcome' | 'steps'>('idle');
  const [index, setIndex] = useState(0);
  const [intro, setIntro] = useState<string | null>(null);
  const userId = user?.id;

  // Start the tour for a new account, or again when "Show the guide" is chosen in the menu.
  useEffect(() => {
    if (!user) return;
    const start = () => {
      if (guideEnabled(user) && !tourDone(user.id)) {
        setIntro(null);
        setIndex(0);
        setPhase('welcome');
      }
    };
    start();
    window.addEventListener(GUIDE_EVENT, start);
    return () => window.removeEventListener(GUIDE_EVENT, start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // After the tour: the first time each page is opened, say what it is for.
  useEffect(() => {
    setIntro(null);
    if (!user || phase !== 'idle' || !guideEnabled(user) || !tourDone(user.id)) return;
    const id = PAGE_IDS[pathname];
    if (!id || pageSeen(user.id, id)) return;
    const timer = window.setTimeout(() => setIntro(id), 800); // let the page draw first
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pathname, phase]);

  const end = useCallback(() => {
    if (user) {
      finishTour(user.id);
      const here = PAGE_IDS[window.location.pathname];
      if (here) markPageSeen(user.id, here); // the page they are on was just covered by the tour
    }
    setPhase('idle');
  }, [user]);

  if (!user) return null;
  if (phase === 'welcome') return <Welcome onStart={() => setPhase('steps')} onSkip={end} />;
  if (phase === 'steps') return <Steps stops={tourStops(user.role)} index={index} setIndex={setIndex} onEnd={end} />;
  if (intro) {
    return (
      <PageIntro
        id={intro}
        onClose={() => {
          markPageSeen(user.id, intro);
          setIntro(null);
        }}
      />
    );
  }
  return null;
}
