import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  RiMenu2Line,
} from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { GUIDE_EVENT, PAGE_IDS, finishTour, guideEnabled, markPageSeen, pageSeen, tourDone, tourStops, type TourStop } from '../lib/guide';

// First-run guide for new accounts (rules in lib/guide.ts): a welcome window, then each icon in the menu bar is lit
// up (pulsing ring) while a big frosted-glass window zooms out of it, with a trail of floating bubbles like a cloud,
// and says what it is; a little confetti when the tour is finished; and -- the first time a page is opened -- a
// window describing that page. The windows use the same glass panel and buttons as the admin warning window
// (WarningModal.tsx). Mounted once in the signed-in layout (App.tsx).

const ICONS: Record<string, (size: number) => ReactNode> = {
  home: (s) => <RiHome2Line size={s} />,
  reels: (s) => <RiVideoFill size={s} />,
  map: (s) => <RiMapFill size={s} />,
  craft: (s) => <RiGamepadLine size={s} />,
  worksheets: (s) => <RiFilePaper2Line size={s} />,
  leaderboard: (s) => <RiBarChartBoxFill size={s} />,
  friends: (s) => <RiGroupFill size={s} />,
  profile: (s) => <RiUserFill size={s} />,
  myReels: (s) => <RiMovie2Line size={s} />,
  adminReports: (s) => <RiBarChartBoxFill size={s} />,
  adminUsers: (s) => <RiGroupFill size={s} />,
  adminVideos: (s) => <RiFilmFill size={s} />,
  adminCertificates: (s) => <RiCertificateFill size={s} />,
  menu: (s) => <RiMenu2Line size={s} />,
};

type Tr = (key: string, vars?: Record<string, string | number>) => string;
function useGuideText(): Tr {
  const { t } = useLanguage();
  return (key, vars) => (t as unknown as Tr)(`guide.${key}`, vars);
}

const spring = { type: 'spring', stiffness: 260, damping: 20 } as const;
/** Each piece of a window rises in, one after the other. */
const rise = (i: number) => ({ style: { animationDelay: `${0.18 + i * 0.07}s` }, className: 'guide-rise' });

function Welcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const g = useGuideText();
  return createPortal(
    <m.div className="modal-overlay guide-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <m.div
        className="modal-panel text-center guide-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-welcome-title"
        style={{ maxWidth: 440 }}
        initial={{ scale: 0.85, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={spring}
      >
        <span className="guide-halo">
          <img className="guide-logo" src="/icons/logo-mark.png" alt="" width={76} height={76} />
        </span>
        <h2 id="guide-welcome-title" {...rise(0)} style={{ fontSize: 24, marginTop: 14, ...rise(0).style }}>
          {g('welcomeTitle')}
        </h2>
        <p {...rise(1)} style={{ fontSize: 15.5, lineHeight: 1.65, margin: '8px 0 0', ...rise(1).style }}>
          {g('welcomeBody')}
        </p>
        <button type="button" className="btn btn-primary btn-block guide-rise" style={{ marginTop: 22, ...rise(2).style }} onClick={onStart} autoFocus>
          {g('start')}
        </button>
        <button type="button" className="btn btn-ghost btn-block guide-rise" style={{ marginTop: 8, ...rise(3).style }} onClick={onSkip}>
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

function Steps({ stops, index, setIndex, onEnd }: { stops: TourStop[]; index: number; setIndex: (i: number) => void; onEnd: (celebrate?: boolean) => void }) {
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
    [12, 20].forEach((size, i) => {
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
  const width = Math.min(410, window.innerWidth - 28);

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
          transition={{ delay: i * 0.07, ...spring }}
        >
          <span className="guide-dot-float" style={{ animationDelay: `${i * 0.5}s` }} />
        </m.span>
      ))}
      <m.div
        ref={popRef}
        key={index}
        className="modal-panel guide-pop"
        style={{ width, top: layout?.top ?? -9999, left: layout?.left ?? -9999, transformOrigin: layout ? `${layout.ox}px ${layout.oy}px` : '50% 50%' }}
        initial={{ scale: 0.05, opacity: 0, rotate: -6 }}
        animate={layout ? { scale: 1, opacity: 1, rotate: 0 } : { scale: 0.05, opacity: 0, rotate: -6 }}
        transition={{ type: 'spring', stiffness: 210, damping: 18 }}
      >
        <div className="guide-head guide-rise" style={rise(0).style}>
          <span className="guide-badge" aria-hidden="true">
            {ICONS[stop.id]?.(26)}
          </span>
          <div className="guide-head-text">
            <span className="guide-chip">{g('stepOf', { n: index + 1, total: stops.length })}</span>
            <h2>{title}</h2>
          </div>
        </div>
        <p {...rise(1)}>{g(`step_${stop.id}`)}</p>
        <div className="guide-progress guide-rise" style={rise(2).style} role="tablist" aria-label={g('tourLabel')}>
          {stops.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`${i + 1} / ${stops.length}`}
              className={`guide-pip${i === index ? ' is-on' : i < index ? ' is-done' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        <div className="guide-actions guide-rise" style={rise(3).style}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEnd()}>
            {g('skip')}
          </button>
          <span className="guide-grow" />
          {index > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIndex(index - 1)}>
              {g('back')}
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (last ? onEnd(true) : setIndex(index + 1))} autoFocus>
            {last ? g('finish') : g('next')}
          </button>
        </div>
      </m.div>
    </div>,
    document.body
  );
}

const CONFETTI = ['#8a1538', '#e9a93b', '#1f8a9e', '#f4a6c0', '#ffffff'];
function Confetti({ onDone }: { onDone: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * window.innerWidth * 0.8,
        up: -(Math.random() * window.innerHeight * 0.5 + 90),
        rot: Math.random() * 720 - 360,
        color: CONFETTI[i % CONFETTI.length],
        size: 7 + Math.random() * 8,
        delay: Math.random() * 0.15,
      })),
    []
  );
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2300);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return createPortal(
    <div className="guide-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <m.span
          key={p.id}
          className="guide-piece"
          style={{ width: p.size, height: p.size * 0.55, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.up, p.up + 300], opacity: [1, 1, 0], rotate: p.rot }}
          transition={{ duration: 1.9, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
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
        className="modal-panel text-center guide-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-intro-title"
        style={{ maxWidth: 440 }}
        initial={{ scale: 0.85, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={spring}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="guide-halo">
          <span className="guide-icon" aria-hidden="true">
            {ICONS[id]?.(36)}
          </span>
        </span>
        <h2 id="guide-intro-title" className="guide-rise" style={{ fontSize: 23, marginTop: 14, ...rise(0).style }}>
          {title}
        </h2>
        <p className="guide-rise" style={{ fontSize: 15.5, lineHeight: 1.65, margin: '8px 0 0', ...rise(1).style }}>
          {g(`page_${id}`)}
        </p>
        <button type="button" className="btn btn-primary btn-block guide-rise" style={{ marginTop: 22, ...rise(2).style }} onClick={onClose} autoFocus>
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
  const [celebrate, setCelebrate] = useState(false);
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

  const end = useCallback(
    (withConfetti?: boolean) => {
      if (user) {
        finishTour(user.id);
        const here = PAGE_IDS[window.location.pathname];
        if (here) markPageSeen(user.id, here); // the page they are on was just covered by the tour
      }
      setPhase('idle');
      if (withConfetti === true) setCelebrate(true);
    },
    [user]
  );

  if (!user) return null;
  return (
    <>
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
      {phase === 'welcome' && <Welcome onStart={() => setPhase('steps')} onSkip={() => end()} />}
      {phase === 'steps' && <Steps stops={tourStops(user.role)} index={index} setIndex={setIndex} onEnd={end} />}
      {phase === 'idle' && intro && (
        <PageIntro
          id={intro}
          onClose={() => {
            markPageSeen(user.id, intro);
            setIntro(null);
          }}
        />
      )}
    </>
  );
}
