import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { NewsCard } from '../components/NewsCard';
import { Topbar } from '../components/Topbar';

type NewsPost = {
  id: number;
  title: string;
  titleAr?: string | null;
  body: string;
  bodyAr?: string | null;
  icon: string;
  subject: string | null;
  publishedAt: string;
};

type Profile = { levelsCompleted: number; totalXp: number; playerLevel: number };

export function HomePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [posts, setPosts] = useState<NewsPost[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const FILTERS: { key: string; label: string; icon: string; color: string }[] = [
    { key: '', label: t('home.filterAll'), icon: '🦅', color: 'stat-card-purple' },
    { key: 'math', label: t('home.filterMath'), icon: '🧮', color: 'stat-card-blue' },
    { key: 'science', label: t('home.filterScience'), icon: '🔬', color: 'stat-card-green' },
  ];

  useEffect(() => {
    api
      .get<{ profile: Profile }>('/users/me')
      .then((d) => setProfile(d.profile))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPosts(null);
    api
      .get<{ posts: NewsPost[] }>(`/news${filter ? `?subject=${filter}` : ''}`)
      .then((data) => {
        if (!cancelled) setPosts(data.posts);
      })
      .catch(() => {
        if (!cancelled) setError(t('home.loadError'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="stack">
      <Topbar title={t('home.greeting', { name: user?.displayName ?? '' })} subtitle={t('home.tagline')} />

      <div className="grid-cards">
        <div className="stat-card stat-card-blue">
          <span className="stat-card-icon" style={{ padding: 0, overflow: 'hidden' }}>
            <img src="/icons/medal-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          </span>
          <div className="stat-card-label">{t('common.level')}</div>
          <div className="stat-card-value">{profile?.playerLevel ?? user?.playerLevel ?? 1}/50</div>
        </div>
        <div className="stat-card stat-card-yellow">
          <span className="stat-card-icon" style={{ padding: 0, overflow: 'hidden' }}>
            <img src="/icons/levels-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
          </span>
          <div className="stat-card-label">{t('profile.levelsCompleted')}</div>
          <div className="stat-card-value">{profile?.levelsCompleted ?? 0}/50</div>
        </div>
        <div className="stat-card stat-card-pink">
          <span className="stat-card-icon" style={{ padding: 0 }}>
            <img src="/icons/xp-icon.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </span>
          <div className="stat-card-label">{t('profile.totalXp')}</div>
          <div className="stat-card-value">{profile?.totalXp ?? user?.totalXp ?? 0}</div>
        </div>
      </div>

      <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
        <Link to="/reels" className="btn btn-primary">
          {t('home.watchReel')}
        </Link>
        <Link to="/map" className="btn btn-secondary">
          {t('home.openMap')}
        </Link>
        <Link to="/craft" className="btn btn-gold">
          {t('home.openCraft')}
        </Link>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('home.filterAll')}</h3>
        <div className="pill-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`category-pill ${f.color}${filter === f.key ? ' selected' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              <span className="category-pill-icon">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="form-error-banner">{error}</div>}

      {!posts && !error && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}

      {posts && posts.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>📭</div>
          <p>{t('home.empty')}</p>
        </div>
      )}

      <div className="stack" style={{ gap: 10 }}>
        {posts?.map((post) => (
          <NewsCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
