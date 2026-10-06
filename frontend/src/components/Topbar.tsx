import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RiNotification3Fill } from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { api } from '../lib/api';
import { RankBadge } from './RankBadge';

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    if (!user || user.role === 'admin') return; // admin has no Friends page
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
  }, [user?.role]);

  if (!user) return null;

  return (
    <div className="topbar">
      <div>
        <h1 className="topbar-title">{title}</h1>
        {subtitle && <p className="topbar-subtitle">{subtitle}</p>}
      </div>
      <div className="flex gap-sm" style={{ alignItems: 'center' }}>
        {user.role !== 'admin' && (
          <>
            <span className="stat-pill" style={{ color: 'var(--pastel-blue-ink)' }} title={t('common.xpUnit')}>
              💎 {user.totalXp}
            </span>
            <span className="stat-pill" style={{ color: 'var(--gold-ink)' }} title={t('common.level')}>
              🏅 {user.playerLevel}
            </span>
            <Link to="/profile" className="stat-pill" title={pickText(lang, user.rankTier.name, user.rankTier.nameAr)} aria-label={pickText(lang, user.rankTier.name, user.rankTier.nameAr)}>
              <RankBadge tier={user.rankTier} size={18} showName={false} />
            </Link>
          </>
        )}
        {user.role !== 'admin' && (
        <Link
          to="/friends"
          className="notif-bell"
          title={t('friends.tabRequests', { n: pendingRequests })}
          aria-label={t('friends.tabRequests', { n: pendingRequests })}
        >
          <span aria-hidden="true">
            <RiNotification3Fill size={17} />
          </span>
          {pendingRequests > 0 && <span className="notif-dot" />}
        </Link>
        )}
      </div>
    </div>
  );
}
