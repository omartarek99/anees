import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import Textify from 'textify.js';
import { gsap } from 'gsap';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { Topbar } from '../components/Topbar';
import { Avatar } from '../components/Avatar';
import { RANK_FRAMES } from '../lib/frames';
import type { RankKey } from '../lib/medalLevels';
import { ChallengePickerModal } from '../components/ChallengePickerModal';
import { ChallengeSetupModal } from '../components/ChallengeSetupModal';

type Profile = {
  levelsCompleted: number;
  totalXp: number;
  playerLevel: number;
  mapLevel: number;
  avatarKey: string;
  avatarUrl: string | null;
};

// The picture and its frame are smaller on a phone.
function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export function HomePage() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  // The frame waits for the profile (or its failure) so a student with a customised character never sees the default one flash first.
  const [loaded, setLoaded] = useState(false);
  const narrow = useNarrow();
  // "تحدى صديقك": pick a friend, then set the challenge up
  const [picking, setPicking] = useState(false);
  const [challengeFor, setChallengeFor] = useState<{ username: string; displayName: string } | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const greeting = t('home.greeting', { name: user?.displayName ?? '' });
  const tagline = t('home.tagline');
  const swooshRef = useRef<SVGSVGElement>(null);

  // The level line, the greeting and the line under it grow in line by line, once (Textify on GSAP; it does not
  // repeat), and the gold swoosh under the greeting grows in the same way just after (it is a drawing, so GSAP animates
  // it directly; in Arabic it ends mirrored, as the CSS draws it, and hands its transform back to the CSS). Lines are
  // whole runs of text, so Arabic keeps its joined letters. The split waits for the web fonts, so the lines are measured
  // in the real font (hidden until then); Textify rewrites the elements' HTML, so each is keyed by its text and the
  // clean-up puts the plain text back. Textify's own stylesheet is not imported (it sets transform on every element).
  // Reduced motion: the text simply shows.
  useLayoutEffect(() => {
    const root = heroRef.current;
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = [...root.querySelectorAll<HTMLElement>('.large-animation-0')];
    const texts = els.map((el) => el.textContent);
    const swoosh = swooshRef.current;
    let cancelled = false;
    els.forEach((el) => (el.style.visibility = 'hidden'));
    if (swoosh) swoosh.style.visibility = 'hidden';
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      els.forEach((el) => (el.style.visibility = ''));
      if (swoosh) {
        swoosh.style.visibility = '';
        const mirrored = getComputedStyle(swoosh).direction === 'rtl';
        gsap.fromTo(
          swoosh,
          { scaleX: 0, scaleY: 0, opacity: 0 },
          { scaleX: mirrored ? -1 : 1, scaleY: 1, opacity: 1, duration: 0.7, delay: 0.15, ease: 'power2', transformOrigin: 'center center', clearProps: 'transform,opacity' }
        );
      }
      try {
        new Textify(
          {
            el: '.large-animation-0',
            splitType: 'lines',
            largeText: true,
            animation: {
              by: 'lines',
              stagger: 0.075,
              duration: 0.7,
              ease: 'power2',
              transformOrigin: 'center center',
              animateProps: { scale: 0, opacity: 0 },
            },
          },
          gsap
        );
      } catch {
        // never leave a heading half-split: show the plain text instead
        els.forEach((el, i) => {
          el.classList.remove('textify', 'is-animated');
          el.textContent = texts[i];
        });
      }
    });
    return () => {
      cancelled = true;
      if (swoosh) {
        gsap.killTweensOf(swoosh);
        gsap.set(swoosh, { clearProps: 'transform,opacity' });
        swoosh.style.visibility = '';
      }
      els.forEach((el, i) => {
        gsap.killTweensOf(el.querySelectorAll('*'));
        el.classList.remove('textify', 'is-animated');
        el.style.visibility = '';
        el.textContent = texts[i];
      });
    };
  }, [greeting, tagline, lang, profile?.playerLevel, user?.playerLevel, user?.rankTier.key]); // the level line is keyed by these too

  useEffect(() => {
    api
      .get<{ profile: Profile }>('/users/me')
      .then((d) => setProfile(d.profile))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const level = profile?.playerLevel ?? user?.playerLevel ?? 1;
  // one string (one text node), so Textify splits it cleanly
  const eyebrow = user ? `${t('common.level')} ${level} · ${pickText(lang, user.rankTier.name, user.rankTier.nameAr)}` : '';
  const rank = ((user?.auraRank && user.auraRank !== 'normal' ? user.auraRank : null) ?? user?.rankTier.key) as RankKey | undefined;
  const fr = rank ? RANK_FRAMES[rank] : undefined;
  // the picture's round window, css px: a quarter smaller than the frames' design size (lib/frames.ts), smaller still on phones
  const hole = Math.round((fr?.hole ?? 132) * 0.75 * (narrow ? 0.62 : 1));
  const pic = Math.round(hole * 1.06);
  const top = { '--hole': `${hole}px`, '--frame': `${Math.round(fr ? hole / fr.ratio : hole * 1.45)}px` } as CSSProperties;
  const completed = profile?.levelsCompleted ?? 0;
  // the adventure-map level they are on (the user level above comes from points)
  const mapLevel = profile?.mapLevel ?? 1;
  const pct = (n: number) => `${Math.round((n / 50) * 100)}%`;
  // One market card per stat: its picture, a corner chip, the value, and where to go with it.
  const cards = [
    { tone: 'blue', src: '/icons/map-icon.webp', title: t('home.mapProgress'), value: `${mapLevel}/50`, chip: pct(mapLevel), to: '/map', cta: t('home.openMap') },
    { tone: 'yellow', src: '/icons/levels-icon.webp', title: t('profile.levelsCompleted'), value: `${completed}/50`, chip: pct(completed), to: '/reels', cta: t('home.watchReel') },
    {
      tone: 'pink',
      src: '/icons/xp-icon.webp',
      title: t('profile.totalXp'),
      value: String(profile?.totalXp ?? user?.totalXp ?? 0),
      chip: user ? pickText(lang, user.rankTier.name, user.rankTier.nameAr) : '',
      to: '/leaderboard',
      cta: t('nav.leaderboard'),
    },
    {
      tone: 'green',
      src: '/icons/challenge-icon.webp',
      title: t('challenge.homeTitle'),
      value: '⚔️',
      chip: 'VS',
      to: null as string | null,
      cta: t('challenge.homeCta'),
    },
  ];

  return (
    <div className="stack">
      {/* The picture sits in the frame of the rank whose colours the pages wear (their own, or an earlier one they picked). The frame is a
          square image with a round hole in the middle; the picture is drawn a little bigger than the hole and tucked under it. */}
      <div className="home-top" style={top}>
        <Topbar />
        <Link to="/profile" className="home-avatar" aria-label={t('home.myProfile')} title={t('home.myProfile')}>
          <span className="home-avatar-pic">
            {loaded ? (
              <Avatar avatarKey={profile?.avatarKey ?? user?.avatarKey ?? 'owl'} photoUrl={profile?.avatarUrl} size={pic} />
            ) : (
              <span className="home-avatar-wait" style={{ width: pic, height: pic }} />
            )}
          </span>
          {rank && <img className="home-frame" src={`/images/frames/${rank}.png`} alt="" decoding="async" />}
        </Link>
      </div>

      <section className="home-hero" ref={heroRef}>
        <div className="home-hero-copy">
          {user && (
            <p key={eyebrow} className="home-eyebrow large-animation-0">
              {eyebrow}
            </p>
          )}
          <h1 key={greeting} className="home-hero-title large-animation-0">
            {greeting}
          </h1>
          <svg ref={swooshRef} className="home-swoosh" viewBox="0 0 168 14" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" aria-hidden="true">
            <path d="M3 9C34 3 62 11 92 6s52-2 73 3" />
          </svg>
          <p key={tagline} className="home-hero-lede large-animation-0">
            {tagline}
          </p>
        </div>
        <div className="home-hero-art">
          <img className="home-hero-image" src="/images/home-hero.webp" width={1240} height={837} decoding="async" alt="" />
        </div>
      </section>

      <section className="home-progress" aria-labelledby="home-progress-title">
        <h2 id="home-progress-title" className="home-section-title">
          {t('home.yourProgress')}
        </h2>
        <div className="grid-cards home-cards">
          {cards.map((c) => (
            <article key={c.tone} className={`market-card stat-card-${c.tone}`}>
              <div className="market-pic">
                <img src={c.src} alt="" />
                <span className="market-chip">{c.chip}</span>
              </div>
              <div className="market-owner">
                <div>
                  <h3 className="market-title">{c.title}</h3>
                  <div className="market-by">
                    <bdi>@{user?.username}</bdi>
                  </div>
                </div>
                <strong className="market-value">{c.value}</strong>
              </div>
              {c.to ? (
                <Link to={c.to} className="btn btn-primary market-cta">
                  {c.cta}
                </Link>
              ) : (
                <button type="button" className="btn btn-primary market-cta" onClick={() => setPicking(true)}>
                  {c.cta}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <ChallengePickerModal
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(f) => {
          setPicking(false);
          setChallengeFor(f);
        }}
      />
      <ChallengeSetupModal friend={challengeFor} onClose={() => setChallengeFor(null)} />
    </div>
  );
}
