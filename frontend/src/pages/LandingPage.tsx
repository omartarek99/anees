import { useEffect, useLayoutEffect, useRef } from 'react';
import Textify from 'textify.js';
import { gsap } from 'gsap';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { AppDownloadSection } from '../components/AppDownloadSection';
import { HelixShowcase, type HelixStory } from '../components/HelixShowcase';
import { ParticleForm } from '../components/ParticleForm';
import '../styles/landing.css';

// The first page a visitor sees (logged-out "/", and "/welcome" for anyone). Layout and type follow the
// "MNTN" Figma landing page; the palette comes from the hero artwork (see landing.css): a layered hero with the
// headline and a language rail; below it a GPU particle form (components/ParticleForm.tsx) that the camera flies ever
// deeper into as the page scrolls down, and that stays behind the three stories (a helix of their pictures that the scroll turns, with
// each story's paragraph beside its picture: components/HelixShowcase.tsx), the app section and the footer. The pictures are Anees's
// own artwork: the story pictures (teacher, adventure map, student) and the hero's Doha skyline, which scrolls with the page and melts
// into the ground below it.

/** The three stories, in order: their pictures (720 px square crops for the helix's square cards) and copy (landing.s1.., s2.., s3..). */
const STORIES = [
  { id: 'learn', key: 's1', nav: 'navLessons', img: '/images/helix/learn.webp' },
  { id: 'play', key: 's2', nav: 'navAdventure', img: '/images/helix/play.webp' },
  { id: 'grow', key: 's3', nav: 'navRewards', img: '/images/helix/grow.webp' },
] as const;

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
  const heroRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const stories: HelixStory[] = STORIES.map((s) => ({
    id: s.id,
    img: s.img,
    copy: (
      <>
        <p className="landing-tag">{t(`landing.${s.key}Tag`)}</p>
        <h2>{t(`landing.${s.key}Title`)}</h2>
        <p className="landing-body">{t(`landing.${s.key}Body`)}</p>
        <Link to="/signup" className="landing-more">
          {t(`landing.${s.key}Cta`)}
          <Arrow />
        </Link>
      </>
    ),
  }));

  // The headline's entrance (Textify on GSAP): its letters grow in from nothing, one after another, when it comes into
  // view. Arabic goes word by word -- split into letters, Arabic loses the joins between them. Textify rewrites the
  // heading's HTML, so it runs before the first paint (no flash of the plain title), the <h1> is keyed by language
  // (a new one each switch) and the clean-up puts the plain text back. Its stylesheet is not imported: it sets
  // transform on every element of the page (*), which would break the fixed and sticky layers; landing.css has the one
  // rule it needs. Reduced motion: the CSS fade of the hero copy instead.
  useLayoutEffect(() => {
    const h1 = titleRef.current;
    if (!h1 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const text = h1.textContent;
    const ar = lang === 'ar';
    new Textify(
      {
        el: '.animation-0',
        splitType: ar ? 'words' : 'words chars', // no line split: nothing to re-measure when the web font arrives
        animation: {
          by: ar ? 'words' : 'chars',
          stagger: 0.025,
          duration: 0.7,
          ease: 'expo.inOut',
          animateProps: { opacity: 0, scale: 0 },
        },
      },
      gsap
    );
    return () => {
      gsap.killTweensOf(h1.querySelectorAll('*'));
      h1.classList.remove('textify', 'is-animated');
      h1.textContent = text;
    };
  }, [lang]);

  // The hero picture drifts a touch slower than the page (--sy), off for reduced motion and on phones.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 900px)').matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      hero.style.setProperty('--sy', String(Math.min(window.scrollY, 1400)));
    };
    const onScroll = () => {
      raf ||= requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/" className="landing-logo" aria-label={t('brand')}>
          {t('brand')}
        </Link>
        <nav className="landing-nav" aria-label={t('brand')}>
          {STORIES.map((s) => (
            <button key={s.id} type="button" onClick={() => goTo(s.id)}>
              {t(`landing.${s.nav}`)}
            </button>
          ))}
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
                  <path d="M5.5 18.5c1.6-3 4-4 6.5-4s4.9 1 6.5 4" />
                </svg>
                {t('landing.login')}
              </Link>
              <Link to="/signup" className="landing-btn landing-btn--solid">{t('landing.signup')}</Link>
            </>
          )}
        </div>
      </header>

      <main>
      <section className="landing-hero" id="top" ref={heroRef}>
        <img
          className="landing-bg"
          src="/images/landing-hero.webp"
          srcSet="/images/landing-hero-1280.webp 1280w, /images/landing-hero.webp 1920w"
          sizes="100vw"
          width={1920}
          height={1071}
          {...{ fetchpriority: 'high' }} /* the page's largest image: fetch it first (React 18 only passes the lowercase name) */
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
          <h1 key={lang} ref={titleRef} className="animation-0">
            {t('landing.heroTitle')}
          </h1>
          <button type="button" className="landing-scroll" onClick={() => goTo('learn')}>
            {t('landing.scroll')}
            <svg className="landing-down" width="16" height="24" viewBox="0 0 16 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M8 2v19M2 15l6 6 6-6" />
            </svg>
          </button>
        </div>
      </section>

      <ParticleForm>
        <HelixShowcase stories={stories} label={t('landing.showcaseLabel')} />

        <AppDownloadSection />

        <footer className="landing-footer-wrap">
          <div className="landing-footer">
          <div className="landing-footer-brand">
            <span className="landing-logo">{t('brand')}</span>
            <p>{t('landing.footerTagline')}</p>
            <p className="landing-footer-about">{t('landing.footerAbout')}</p>
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
          <div className="landing-footer-col">
            <h3>{t('landing.colContact')}</h3>
            <span>{t('landing.contactLine')}</span>
            <a href="mailto:info@anees-qa.site" dir="ltr">info@anees-qa.site</a>
          </div>
          </div>
        </footer>
      </ParticleForm>
      </main>
    </div>
  );
}
