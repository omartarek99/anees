import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { Topbar } from '../components/Topbar';
import { AnimatedText } from '../components/AnimatedText';

type Profile = { levelsCompleted: number; totalXp: number; playerLevel: number };

export function HomePage() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    api
      .get<{ profile: Profile }>('/users/me')
      .then((d) => setProfile(d.profile))
      .catch(() => {});
  }, []);

  const level = profile?.playerLevel ?? user?.playerLevel ?? 1;
  const completed = profile?.levelsCompleted ?? 0;
  const pct = (n: number) => `${Math.round((n / 50) * 100)}%`;
  // One market card per stat: its picture, a corner chip, the value, and where to go with it.
  const cards = [
    { tone: 'blue', src: '/icons/map-icon.webp', title: t('home.mapProgress'), value: `${level}/50`, chip: pct(level), to: '/map', cta: t('home.openMap') },
    { tone: 'yellow', src: '/icons/levels-icon.png', title: t('profile.levelsCompleted'), value: `${completed}/50`, chip: pct(completed), to: '/reels', cta: t('home.watchReel') },
    {
      tone: 'pink',
      src: '/icons/xp-icon.webp',
      title: t('profile.totalXp'),
      value: String(profile?.totalXp ?? user?.totalXp ?? 0),
      chip: user ? pickText(lang, user.rankTier.name, user.rankTier.nameAr) : '',
      to: '/leaderboard',
      cta: t('nav.leaderboard'),
    },
  ];

  return (
    <div className="stack">
      <Topbar />

      <section className="home-hero">
        <div className="home-hero-copy">
          {user && (
            <p className="home-eyebrow">
              {t('common.level')} {level} · {pickText(lang, user.rankTier.name, user.rankTier.nameAr)}
            </p>
          )}
          <h1 className="home-hero-title title-ease">
            <AnimatedText>{t('home.greeting', { name: user?.displayName ?? '' })}</AnimatedText>
          </h1>
          <svg className="home-swoosh" viewBox="0 0 168 14" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" aria-hidden="true">
            <path d="M3 9C34 3 62 11 92 6s52-2 73 3" />
          </svg>
          <p className="home-hero-lede">{t('home.tagline')}</p>
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
              <Link to={c.to} className="btn btn-primary market-cta">
                {c.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
