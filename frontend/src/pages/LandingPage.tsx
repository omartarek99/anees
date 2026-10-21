import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import '../styles/landing.css';

// The first page a visitor sees (logged-out "/", and "/welcome" for anyone). Layout and type follow the
// "MNTN" Figma landing page; the palette is the Anees brand board (maroon / sky blue / sand): a layered
// hero with the headline, a left rail and a right "Start / 01 / 02 / 03" progress rail, three alternating
// story sections, a footer. The story pictures are Anees's own artwork (teacher, adventure map, student); the hero is an inline SVG
// (no network, scales crisply).

const SECTIONS = [
  { id: 'learn', n: '01', key: 's1', img: '/images/landing-learn.webp' },
  { id: 'play', n: '02', key: 's2', img: '/images/landing-play.webp' },
  { id: 'grow', n: '03', key: 's3', img: '/images/landing-grow.webp' },
] as const;

const STEP_IDS = ['top', ...SECTIONS.map((s) => s.id)];

// x, y, width, height, corner radius of each tower; the tall rounded ones echo West Bay's silhouette.
const SKYLINE = [
  [1350, 200, 26, 160, 1],
  [1382, 172, 30, 190, 1],
  [1418, 218, 22, 150, 1],
  [1478, 188, 34, 180, 17],
  [1522, 142, 42, 220, 21],
  [1574, 206, 28, 160, 1],
  [1608, 176, 24, 190, 1],
  [1638, 226, 36, 140, 1],
  [1680, 196, 26, 170, 1],
  [1712, 238, 30, 130, 1],
] as const;

const STARS = Array.from({ length: 30 }, (_, i) => ({
  x: (i * 673) % 1920,
  y: 40 + ((i * 379) % 380),
  r: 1 + (i % 3) * 0.6,
  o: 0.3 + (i % 4) * 0.12,
}));

function goTo(id: string) {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
}

function Arrow() {
  return (
    <svg className="landing-arrow" width="24" height="16" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M1 8h21M16 2l6 6-6 6" />
    </svg>
  );
}

// Three dune ridges (far -> near) with a small figure on the near one, like the hiker in the design.
function HeroScene() {
  return (
    <div className="landing-scene" aria-hidden="true">
      <svg className="landing-layer landing-layer--sky" viewBox="0 0 1920 700" preserveAspectRatio="xMidYMin slice">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={i % 5 === 0 ? '#27aae1' : '#f6f1e9'} opacity={s.o} />
        ))}
        <defs>
          <radialGradient id="moon-glow">
            <stop offset="0" stopColor="#27aae1" stopOpacity="0.32" />
            <stop offset="0.35" stopColor="#27aae1" stopOpacity="0.16" />
            <stop offset="0.7" stopColor="#27aae1" stopOpacity="0.05" />
            <stop offset="1" stopColor="#27aae1" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="1480" cy="210" r="150" fill="url(#moon-glow)" />
        <path d="M1498 168a44 44 0 1 0 0 84a34 34 0 1 1 0-84z" fill="#f6f1e9" opacity="0.92" />
      </svg>
      <svg className="landing-layer landing-layer--far" viewBox="0 0 1920 700" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="dune-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6b2340" />
            <stop offset="0.5" stopColor="#4a1a30" />
            <stop offset="1" stopColor="#331424" />
          </linearGradient>
          <radialGradient id="horizon-glow">
            <stop offset="0" stopColor="#f6f1e9" stopOpacity="0.5" />
            <stop offset="0.3" stopColor="#d9788c" stopOpacity="0.3" />
            <stop offset="0.65" stopColor="#8a1538" stopOpacity="0.1" />
            <stop offset="1" stopColor="#8a1538" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="720" cy="300" rx="1100" ry="210" fill="url(#horizon-glow)" />
        <g fill="#2a1219" transform="translate(-420 -105) scale(1.3)">
          {SKYLINE.map(([x, y, w, h, r], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx={r} />
          ))}
          <path d="M1452 340V160l8-44 8 44v180z" />
        </g>
        <g fill="#27aae1" opacity="0.7" transform="translate(-420 -105) scale(1.3)">
          {[1392, 1428, 1530, 1584, 1646, 1688].map((x, i) => (
            <rect key={x} x={x} y={190 + (i % 3) * 22} width="3" height="3" />
          ))}
        </g>
        <path d="M0 300C260 230 430 270 650 235S1040 150 1280 215S1660 280 1920 200V700H0Z" fill="url(#dune-far)" />
      </svg>
      <svg className="landing-layer landing-layer--mid" viewBox="0 0 1920 700" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="dune-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#44192c" />
            <stop offset="0.5" stopColor="#2e1721" />
            <stop offset="1" stopColor="#22141a" />
          </linearGradient>
        </defs>
        <path d="M0 400C300 330 520 380 800 330S1260 250 1520 320S1780 390 1920 340V700H0Z" fill="url(#dune-mid)" />
        <path d="M0 400C300 330 520 380 800 330S1260 250 1520 320S1780 390 1920 340" fill="none" stroke="#27aae1" strokeOpacity="0.4" strokeWidth="2" />
      </svg>
      <svg className="landing-layer landing-layer--near" viewBox="0 0 1920 700" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="dune-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c1822" />
            <stop offset="0.4" stopColor="#23151b" />
            <stop offset="1" stopColor="#1b1518" />
          </linearGradient>
        </defs>
        <path d="M0 470C190 440 420 400 650 420S1060 500 1320 530S1740 540 1920 520V700H0Z" fill="url(#dune-near)" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M0 ${540 + i * 46}C320 ${515 + i * 40} 640 ${560 + i * 44} 960 ${548 + i * 46}S1560 ${600 + i * 40} 1920 ${566 + i * 44}`} fill="none" stroke="#f6f1e9" strokeOpacity={0.07 - i * 0.015} strokeWidth="2" />
        ))}
        <path d="M0 470C190 440 420 400 650 420S1060 500 1320 530S1740 540 1920 520" fill="none" stroke="#f6f1e9" strokeOpacity="0.2" strokeWidth="2" />
        <g fill="#0f0a0c" transform="translate(560 336)">
          <circle cx="12" cy="9" r="8" />
          <path d="M3 20h18l5 22-5 4v34h-7V54h-4v26H3V46l-5-4z" />
          <rect x="-3" y="22" width="10" height="26" rx="4" />
          <path d="M24 26l16-12 3 5-15 14z" />
        </g>
      </svg>
    </div>
  );
}

export function LandingPage() {
  const { t, lang, setLang } = useLanguage();
  const { user } = useAuth();
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLElement>(null);

  // One rAF-throttled scroll handler drives everything that follows the page:
  //  - the side rail: --f is a continuous 0..3 position between the step headings (the marker slides and
  //    the filled line grows as you scroll), `active` is the heading currently crossing mid-screen;
  //  - the hero parallax (--sy), off for reduced motion and on phones.
  useEffect(() => {
    const hero = heroRef.current;
    const rail = railRef.current;
    if (!hero || !rail) return;
    const parallax = !window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 900px)').matches;
    const els = STEP_IDS.map((id) => document.getElementById(id)!);
    let raf = 0;
    let current = -1;
    const update = () => {
      raf = 0;
      if (parallax) hero.style.setProperty('--sy', String(Math.min(window.scrollY, 1400)));
      const mid = window.innerHeight / 2;
      const tops = els.map((el) => el.getBoundingClientRect().top);
      let i = 0;
      for (let k = 1; k < tops.length; k++) if (tops[k] <= mid) i = k;
      const span = i + 1 < tops.length ? tops[i + 1] - tops[i] : 0;
      const f = i + (span > 0 ? Math.min(1, Math.max(0, (mid - tops[i]) / span)) : 0);
      rail.style.setProperty('--f', f.toFixed(3));
      if (i !== current) {
        current = i;
        setActive(i);
      }
    };
    const onScroll = () => {
      raf ||= requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Intro animation: each story's text (and picture) eases in the first time it scrolls into view.
  // The hidden starting state only exists once this has run (class js-reveal), so without JS everything
  // is simply visible. With reduced motion (class js-calm) the same reveal is a plain fade: no sliding,
  // no scaling -- the parallax stays off for those visitors.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.add('js-reveal');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('js-calm');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }),
      { threshold: 0.18, rootMargin: '0px 0px -6% 0px' }
    );
    root.querySelectorAll('.landing-story').forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove('js-reveal', 'js-calm');
    };
  }, []);

  return (
    <div className="landing" ref={rootRef}>
      <header className="landing-header">
        <Link to="/" className="landing-logo" aria-label={t('brand')}>
          {t('brand')}
        </Link>
        <nav className="landing-nav" aria-label="Anees">
          <button type="button" onClick={() => goTo('learn')}>{t('landing.navLessons')}</button>
          <button type="button" onClick={() => goTo('play')}>{t('landing.navAdventure')}</button>
          <button type="button" onClick={() => goTo('grow')}>{t('landing.navRewards')}</button>
        </nav>
        <div className="landing-actions">
          {user ? (
            <Link to="/" className="landing-btn landing-btn--solid">{t('landing.openApp')}</Link>
          ) : (
            <>
              <Link to="/login" className="landing-btn landing-btn--ghost">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <circle cx="12" cy="12" r="9.5" />
                  <circle cx="12" cy="10" r="3.2" />
                  <path d="M5.5 18.5c1.6-3 4-4 6.5-4s4.900 1 6.500 4" />
                </svg>
                {t('landing.login')}
              </Link>
              <Link to="/signup" className="landing-btn landing-btn--solid">{t('landing.signup')}</Link>
            </>
          )}
        </div>
      </header>

      <nav className="landing-steps" aria-label="Sections" ref={railRef}>
        <span className="landing-steps-track" aria-hidden="true">
          <span />
        </span>
        <ol>
          {STEP_IDS.map((id, i) => (
            <li key={id} className={i < active ? 'is-past' : undefined}>
              <button type="button" aria-current={active === i ? 'step' : undefined} onClick={() => goTo(id)}>
                {i === 0 ? t('landing.start') : SECTIONS[i - 1].n}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="landing-hero" id="top" ref={heroRef}>
        <HeroScene />
        <div className="landing-rail" role="group" aria-label={t('landing.language')}>
          <span>{t('landing.language')}</span>
          <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
          <button type="button" lang="ar" aria-label="العربية" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')}>ع</button>
        </div>

        <div className="landing-hero-copy">
          <p className="landing-tag">{t('landing.heroTag')}</p>
          <h1>{t('landing.heroTitle')}</h1>
          <button type="button" className="landing-scroll" onClick={() => goTo('learn')}>
            {t('landing.scroll')}
            <svg className="landing-down" width="16" height="24" viewBox="0 0 16 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M8 2v19M2 15l6 6 6-6" />
            </svg>
          </button>
        </div>
      </section>

      <main className="landing-stories">
        {SECTIONS.map((s, i) => (
          <section key={s.id} id={s.id} className={`landing-story${i % 2 ? ' is-flipped' : ''}`}>
            <div className="landing-copy">
              <span className="landing-num" aria-hidden="true">{s.n}</span>
              <p className="landing-tag">{t(`landing.${s.key}Tag`)}</p>
              <h2>{t(`landing.${s.key}Title`)}</h2>
              <p className="landing-body">{t(`landing.${s.key}Body`)}</p>
              <Link to="/signup" className="landing-more">
                {t(`landing.${s.key}Cta`)}
                <Arrow />
              </Link>
            </div>
            <img src={s.img} width={566} height={720} loading="lazy" decoding="async" alt={t(`landing.${s.key}Alt`)} />
          </section>
        ))}
      </main>

      <footer className="landing-footer-wrap">
        <div className="landing-footer">
        <div className="landing-footer-brand">
          <span className="landing-logo">{t('brand')}</span>
          <p>{t('landing.footerTagline')}</p>
          <div className="landing-actions">
            <Link to="/signup" className="landing-btn landing-btn--solid">{t('landing.signup')}</Link>
            <Link to="/login" className="landing-btn landing-btn--ghost">{t('landing.login')}</Link>
          </div>
          <small>{t('landing.copyright')}</small>
        </div>
        <div className="landing-footer-col">
          <h3>{t('landing.colAnees')}</h3>
          <Link to="/login">{t('landing.login')}</Link>
          <Link to="/signup">{t('landing.signup')}</Link>
          <Link to="/signup">{t('landing.teach')}</Link>
        </div>
        <div className="landing-footer-col">
          <h3>{t('landing.colLegal')}</h3>
          <Link to="/privacy">{t('legal.privacy')}</Link>
          <Link to="/terms">{t('legal.terms')}</Link>
          <Link to="/cookies">{t('legal.cookies')}</Link>
        </div>
        </div>
      </footer>
    </div>
  );
}
