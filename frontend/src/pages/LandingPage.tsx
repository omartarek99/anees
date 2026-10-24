import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { InstallAppButton } from '../components/InstallAppButton';
import '../styles/landing.css';

// The first page a visitor sees (logged-out "/", and "/welcome" for anyone). Layout and type follow the
// "MNTN" Figma landing page; the palette is the Anees brand board (maroon / sky blue / sand): a layered
// hero with the headline, a left rail and a right "Start / 01 / 02 / 03" progress rail, three alternating
// story sections, a footer. The pictures are Anees's own artwork: the story pictures (teacher, adventure map,
// student) and the hero's Doha skyline, which scrolls with the page and melts into the ground below it.

const SECTIONS = [
  { id: 'learn', n: '01', key: 's1', img: '/images/landing-learn.webp' },
  { id: 'play', n: '02', key: 's2', img: '/images/landing-play.webp' },
  { id: 'grow', n: '03', key: 's3', img: '/images/landing-grow.webp' },
] as const;

const STEP_IDS = ['top', ...SECTIONS.map((s) => s.id)];

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
        <img
          className="landing-bg"
          src="/images/landing-hero.webp"
          srcSet="/images/landing-hero-1280.webp 1280w, /images/landing-hero.webp 1920w"
          sizes="100vw"
          width={1920}
          height={1071}
          decoding="async"
          alt=""
        />
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
            <InstallAppButton variant="landing" />
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
