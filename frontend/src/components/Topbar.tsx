import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { api } from '../lib/api';
import { RankBadge } from './RankBadge';

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ incoming: unknown[] }>('/friends/requests')
      .then((d) => {
        if (!cancelled) setPendingRequests(d.incoming.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  return (
    <div className="topbar">
      <div>
        <h1 className="topbar-title">{title}</h1>
        {subtitle && <p className="topbar-subtitle">{subtitle}</p>}
      </div>
      <div className="flex gap-sm" style={{ alignItems: 'center' }}>
        <span className="stat-pill" style={{ color: 'var(--pastel-blue-ink)' }}>
          💎 {user.totalXp}
        </span>
        <span className="stat-pill" style={{ color: 'var(--gold-dark)' }}>
          🏅 {user.playerLevel}
        </span>
        <Link to="/profile" className="stat-pill" title={user.rankTier.name}>
          <RankBadge tier={user.rankTier} size={18} showName={false} />
        </Link>
        <Link to="/friends" className="notif-bell" title={t('friends.tabRequests', { n: pendingRequests })}>
          🔔
          {pendingRequests > 0 && <span className="notif-dot" />}
        </Link>
      </div>
    </div>
  );
}
