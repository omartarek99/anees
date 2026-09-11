import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { Topbar } from '../components/Topbar';

type Profile = { levelsCompleted: number; totalXp: number; playerLevel: number };

export function HomePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    api
      .get<{ profile: Profile }>('/users/me')
      .then((d) => setProfile(d.profile))
      .catch(() => {});
  }, []);

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
    </div>
  );
}
