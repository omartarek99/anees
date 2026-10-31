import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { Topbar } from '../components/Topbar';
import { AnimatedText } from '../components/AnimatedText';
import { ProfileAvatar3D } from '../components/ProfileAvatar3D';
import type { AvatarConfig } from '../components/avatar3d/avatarConfig';
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
  avatar3d: AvatarConfig | null;
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

  useEffect(() => {
    api
      .get<{ profile: Profile }>('/users/me')
      .then((d) => setProfile(d.profile))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const level = profile?.playerLevel ?? user?.playerLevel ?? 1;
  const rank = (user?.auraRank ?? user?.rankTier.key) as RankKey | undefined;
  const fr = rank ? RANK_FRAMES[rank] : undefined;
  const hole = Math.round((fr?.hole ?? 132) * (narrow ? 0.62 : 1)); // the picture's round window, css px
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
              <ProfileAvatar3D avatarKey={profile?.avatarKey ?? user?.avatarKey ?? 'falcon'} photoUrl={profile?.avatarUrl} config={profile?.avatar3d ?? null} size={pic} />
            ) : (
              <span className="home-avatar-wait" style={{ width: pic, height: pic }} />
            )}
          </span>
          {rank && <img className="home-frame" src={`/images/frames/${rank}.png`} alt="" decoding="async" />}
        </Link>
      </div>

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
