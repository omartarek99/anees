import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { Avatar } from '../components/Avatar';
import { RankBadge, type RankTier } from '../components/RankBadge';
import { Topbar } from '../components/Topbar';

type Leader = { rank: number; username: string; displayName: string; avatarKey: string; xp: number; rankTier: RankTier };

type LeaderboardResponse = {
  month: string;
  leaders: Leader[];
  me: Leader | null;
  inTop20: boolean;
};

const CROWNS: Record<number, string> = { 1: '👑', 2: '🥈', 3: '🥉' };
const PODIUM_ORDER = [2, 1, 3];

function PodiumColumn({ leader, xpUnit }: { leader: Leader; xpUnit: string }) {
  return (
    <div className={`podium-col podium-${leader.rank}`}>
      <div style={{ fontSize: leader.rank === 1 ? 26 : 20 }}>{CROWNS[leader.rank]}</div>
      <div className="podium-avatar-ring">
        <Avatar avatarKey={leader.avatarKey} size={leader.rank === 1 ? 64 : 52} />
      </div>
      <div style={{ fontWeight: 800, fontSize: 13, textAlign: 'center' }}>{leader.displayName}</div>
      <RankBadge tier={leader.rankTier} size={20} />
      <span className="badge badge-gold" style={{ fontSize: 11 }}>
        💎 {leader.xp} {xpUnit}
      </span>
      <div className="podium-block">#{leader.rank}</div>
    </div>
  );
}

function LeaderRow({ leader, highlight, xpUnit }: { leader: Leader; highlight: boolean; xpUnit: string }) {
  return (
    <div className="list-row flex-between" style={highlight ? { background: 'var(--maroon-pale)' } : undefined}>
      <div className="flex gap-md" style={{ alignItems: 'center' }}>
        <span style={{ width: 28, textAlign: 'center', fontWeight: 800 }}>#{leader.rank}</span>
        <Avatar avatarKey={leader.avatarKey} size={40} />
        <div>
          <div style={{ fontWeight: 700 }}>{leader.displayName}</div>
          <div className="flex gap-sm" style={{ alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>
              @{leader.username}
            </span>
            <RankBadge tier={leader.rankTier} size={16} />
          </div>
        </div>
      </div>
      <span className="badge badge-gold">
        💎 {leader.xp} {xpUnit}
      </span>
    </div>
  );
}

export function LeaderboardPage() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<LeaderboardResponse>('/leaderboard')
      .then(setData)
      .catch(() => setError(t('leaderboard.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthLabel = new Date().toLocaleString(lang === 'ar' ? 'ar-QA' : 'en-US', { month: 'long', year: 'numeric' });
  const xpUnit = t('common.xpUnit');
  const top3 = data?.leaders.slice(0, 3) ?? [];
  const rest = data?.leaders.slice(3) ?? [];

  return (
    <div className="stack">
      <Topbar title={t('leaderboard.title')} subtitle={t('leaderboard.subtitle', { month: monthLabel })} />

      {error && <div className="form-error-banner">{error}</div>}
      {!data && !error && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}

      {data && data.leaders.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>🌱</div>
          <p>{t('leaderboard.empty')}</p>
        </div>
      )}

      {top3.length > 0 && (
        <div className="podium-wrap">
          {PODIUM_ORDER.map((rank) => {
            const leader = top3.find((l) => l.rank === rank);
            return leader ? <PodiumColumn key={rank} leader={leader} xpUnit={xpUnit} /> : <div key={rank} className="podium-col" />;
          })}
        </div>
      )}

      {rest.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {rest.map((leader) => (
            <LeaderRow key={leader.username} leader={leader} highlight={leader.username === user?.username} xpUnit={xpUnit} />
          ))}
        </div>
      )}

      {data && data.me && !data.inTop20 && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="muted text-center">{t('leaderboard.yourRanking')}</p>
          <LeaderRow leader={data.me} highlight xpUnit={xpUnit} />
        </div>
      )}
    </div>
  );
}
