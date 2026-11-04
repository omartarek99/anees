import { useEffect, useState, type CSSProperties } from 'react';
import { useLanguage } from '../lib/language-context';

// The opening scene, shown once each time the site is opened in a tab: the logo and the 3D pieces (cap, star, light bulb) spin in
// from the top-left behind a gold comet trail, land with a shockwave and a burst of sparks, then the pieces circle the logo, the
// name and the tagline appear, and the scene zooms away into the page. It sits on top of the page while that loads, can be skipped
// with a tap or a key, and is not shown at all to people who asked for less motion.

const SEEN_KEY = 'anees_intro_seen';
const SHOW_MS = 4450; // when it starts to leave (it is gone 5 seconds after it appears)
const LEAVE_MS = 550; // how long leaving takes

const PIECES = [
  { src: '/images/intro/cap.webp', size: 92 },
  { src: '/images/intro/star.webp', size: 80 },
  { src: '/images/intro/bulb.webp', size: 70 },
] as const;

// little gold sparkles scattered over the scene (fixed positions, so it looks the same every time)
const SPARKS = [
  [12, 22, 0], [86, 18, 0.6], [24, 70, 1.1], [78, 74, 0.3], [50, 10, 0.9], [6, 48, 1.4], [93, 50, 0.2], [38, 88, 0.7], [64, 90, 1.2], [30, 34, 1.6], [70, 30, 0.4], [55, 80, 1.0],
] as const;

// the burst of sparks when the logo lands: 16 of them, thrown out in a circle (angle, distance as a share of the stage)
const BURST = Array.from({ length: 16 }, (_, i) => [i * 22.5, i % 2 ? 0.62 : 0.9] as const);

// Development only: opening any page with ?introHold shows the scene every time and keeps it, to look at it.
const HOLD = import.meta.env.DEV && new URLSearchParams(window.location.search).has('introHold');

function shouldShow(): boolean {
  if (HOLD) return true;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (sessionStorage.getItem(SEEN_KEY)) return false;
  } catch {
    // storage blocked: it just shows each time the page is opened
  }
  return true;
}

export function IntroSplash() {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>(() => (shouldShow() ? 'show' : 'gone'));

  // it counts as seen once it is on screen (not while deciding whether to show it, which React may do twice)
  useEffect(() => {
    if (HOLD) return;
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // see shouldShow
    }
  }, []);

  useEffect(() => {
    if (phase === 'show' && !HOLD) {
      const timer = window.setTimeout(() => setPhase('leave'), SHOW_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === 'leave') {
      const timer = window.setTimeout(() => setPhase('gone'), LEAVE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  if (phase === 'gone') return null;
  const skip = () => setPhase((p) => (p === 'show' ? 'leave' : p));

  return (
    <div
      className={`intro-splash${phase === 'leave' ? ' is-leaving' : ''}`}
      role="presentation"
      onClick={skip}
      onKeyDown={skip}
    >
      <div className="intro-rays" aria-hidden="true" />
      <div className="intro-glow" aria-hidden="true" />
      {SPARKS.map(([x, y, d], i) => (
        <i key={i} className="intro-spark" aria-hidden="true" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` } as CSSProperties} />
      ))}

      <div className="intro-stage" aria-hidden="true">
        <i className="intro-comet" />
        <i className="intro-wave" />
        <i className="intro-wave is-second" />
        {BURST.map(([a, d], i) => (
          <i key={i} className="intro-burst" style={{ '--a': `${a}deg`, '--d': d } as CSSProperties} />
        ))}
        <div className="intro-fly">
          <div className="intro-ring">
            <div className="intro-spin">
              {PIECES.map((p, i) => (
                <div key={p.src} className="intro-slot" style={{ '--ang': `${i * 120}deg` } as CSSProperties}>
                  <div className="intro-upright">
                    <div className="intro-face" style={{ inlineSize: p.size, blockSize: p.size }}>
                      <img src={p.src} alt="" width={p.size} height={p.size} decoding="async" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="intro-logo">
          <img src="/icons/logo-mark.png" alt="" width={220} height={220} decoding="async" />
          <span className="intro-gloss" />
        </div>
      </div>

      <div className="intro-words">
        <h1 className="intro-name">{t('brand')}</h1>
        <p className="intro-tagline">{t('intro.tagline')}</p>
      </div>
      <button type="button" className="intro-skip" onClick={skip}>
        {t('intro.skip')}
      </button>
    </div>
  );
}
