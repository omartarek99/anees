import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { m } from 'framer-motion';
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

// First-run guide for new accounts (rules in lib/guide.ts): a welcome window, then each icon in the menu bar is lit
// up while a big frosted-glass window zooms out of it (with a trail of little bubbles, like a cloud) and says what
// it is, then -- the first time a page is opened -- a window describing that page. The windows use the same glass
// panel and buttons as the admin warning window (WarningModal.tsx). Mounted once in the signed-in layout (App.tsx).

const PAGE_ICONS: Record<string, ReactNode> = {
  home: <RiHome2Line size={34} />,
  reels: <RiVideoFill size={34} />,
  map: <RiMapFill size={34} />,
  craft: <RiGamepadLine size={34} />,
  worksheets: <RiFilePaper2Line size={34} />,
  leaderboard: <RiBarChartBoxFill size={34} />,
  friends: <RiGroupFill size={34} />,
  profile: <RiUserFill size={34} />,
  myReels: <RiMovie2Line size={34} />,
  adminReports: <RiBarChartBoxFill size={34} />,
  adminUsers: <RiGroupFill size={34} />,
  adminVideos: <RiFilmFill size={34} />,
  adminCertificates: <RiCertificateFill size={34} />,
};

type Tr = (key: string, vars?: Record<string, string | number>) => string;
function useGuideText(): Tr {
  const { t } = useLanguage();
  return (key, vars) => (t as unknown as Tr)(`guide.${key}`, vars);
}

const spring = { type: 'spring', stiffness: 260, damping: 20 } as const;

function Welcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const g = useGuideText();
  return createPortal(
    <m.div className="modal-overlay guide-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <m.div
        className="modal-panel text-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-welcome-title"
        style={{ maxWidth: 420 }}
        initial={{ scale: 0.9, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={spring}
      >
        <img className="guide-logo" src="/icons/logo-mark.png" alt="" width={72} height={72} />
        <h2 id="guide-welcome-title" style={{ fontSize: 23, marginTop: 10 }}>
          {g('welcomeTitle')}
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, margin: '6px 0 0' }}>{g('welcomeBody')}</p>
        <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 22 }} onClick={onStart} autoFocus>
          {g('start')}
        </button>
        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onSkip}>
          {g('skipNow')}
        </button>
      </m.div>
    </m.div>,
    document.body
  );
}

type Layout = {
  top: number;
  left: number;
  side: 'top' | 'start' | 'end';
  /** icon centre relative to the window: where it zooms out from */
  ox: number;
  oy: number;
  dots: { x: number; y: number; size: number }[];
};

function Steps({ stops, index, setIndex, onEnd }: { stops: TourStop[]; index: number; setIndex: (i: number) => void; onEnd: () => void }) {
  const { t } = useLanguage();
  const g = useGuideText();
  const stop = stops[index];
  const last = index === stops.length - 1;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
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
    setLayout(null);
    setRect(r);
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

  // Put the window near the icon -- not touching it: above it on a phone (bottom tab bar), beside it on the side bar --
  // and line up the little bubbles between the two.
  useLayoutEffect(() => {
    if (!rect || !popRef.current) return;
    const w = popRef.current.offsetWidth;
    const h = popRef.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 58;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    let top: number, left: number, side: Layout['side'];
    if (cy > vh * 0.55) {
      side = 'top';
      left = clamp(cx - w / 2, 14, vw - w - 14);
      top = clamp(rect.top - 6 - gap - h, 14, vh);
    } else if (cx < vw / 2) {
      side = 'end';
      top = clamp(cy - h / 2, 14, vh - h - 14);
      left = rect.right + 6 + gap;
    } else {
      side = 'start';
      top = clamp(cy - h / 2, 14, vh - h - 14);
      left = rect.left - 6 - gap - w;
    }
    // two bubbles, small near the icon and bigger near the window
    const dots: Layout['dots'] = [];
    const sizes = [12, 20];
    sizes.forEach((size, i) => {
      const dist = 18 + i * 22;
      if (side === 'top') dots.push({ x: cx, y: rect.top - 6 - dist, size });
      else if (side === 'end') dots.push({ x: rect.right + 6 + dist, y: cy, size });
      else dots.push({ x: rect.left - 6 - dist, y: cy, size });
    });
    setLayout({ top, left, side, ox: cx - left, oy: cy - top, dots });
  }, [rect, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onEnd();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEnd]);

  if (!rect) return null;
  const title = stop.id === 'menu' ? t('common.menu') : t(`nav.${stop.id}` as 'nav.home');
  const width = Math.min(400, window.innerWidth - 28);

  return createPortal(
    <div className="guide-layer" role="dialog" aria-modal="true" aria-label={g('tourLabel')}>
      <div className="guide-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />
      {layout?.dots.map((d, i) => (
        <m.span
          key={`${index}-${i}`}
          className="guide-dot"
          style={{ left: d.x - d.size / 2, top: d.y - d.size / 2, width: d.size, height: d.size }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: i * 0.06, ...spring }}
        />
      ))}
      <m.div
        ref={popRef}
        key={index}
        className="modal-panel guide-pop"
        style={{ width, top: layout?.top ?? -9999, left: layout?.left ?? -9999, transformOrigin: layout ? `${layout.ox}px ${layout.oy}px` : '50% 50%' }}
        initial={{ scale: 0.05, opacity: 0 }}
        animate={layout ? { scale: 1, opacity: 1 } : { scale: 0.05, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      >
        <span className="guide-chip">{g('stepOf', { n: index + 1, total: stops.length })}</span>
        <h2>{title}</h2>
        <p>{g(`step_${stop.id}`)}</p>
        <div className="guide-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEnd}>
            {g('skip')}
          </button>
          <span className="guide-grow" />
          {index > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIndex(index - 1)}>
              {g('back')}
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (last ? onEnd() : setIndex(index + 1))} autoFocus>
            {last ? g('finish') : g('next')}
          </button>
        </div>
      </m.div>
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
    <m.div className="modal-overlay guide-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose}>
      <m.div
        className="modal-panel text-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-intro-title"
        style={{ maxWidth: 420 }}
        initial={{ scale: 0.9, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={spring}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="guide-icon" aria-hidden="true">
          {PAGE_ICONS[id]}
        </span>
        <h2 id="guide-intro-title" style={{ fontSize: 22, marginTop: 10 }}>
          {title}
        </h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, margin: '6px 0 0' }}>{g(`page_${id}`)}</p>
        <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 22 }} onClick={onClose} autoFocus>
          {g('gotIt')}
        </button>
      </m.div>
    </m.div>,
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
