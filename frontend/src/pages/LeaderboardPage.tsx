import { useEffect, useState } from 'react';
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { Avatar } from '../components/Avatar';
import { RankBadge, type RankTier } from '../components/RankBadge';
import { Topbar } from '../components/Topbar';
import { VictoryShield } from '../components/VictoryShield';
import { XpIcon } from '../components/XpIcon';
import '../styles/leaderboard.css';

type Leader = { rank: number; username: string; displayName: string; avatarKey: string; xp: number; rankTier: RankTier; hasShield?: boolean };

type LeaderboardResponse = {
  month: string;
  leaders: Leader[];
  me: Leader | null;
  inTop20: boolean;
  // People who earned anything in the month -- the "out of N" under the podium.
  participants: number;
  // True when the requesting user is a teacher -- backend then ranks by teacher_points
  // (video uploads + worksheet prints) among teachers only, instead of student XP.
  isTeacherBoard: boolean;
};

type Period = 'current' | 'previous';

const PODIUM_ORDER = [2, 1, 3];
const PAGE_SIZE = 8;
const fmt = (n: number) => n.toLocaleString('en-US');

/** The board's months are UTC (the backend's `date('now', 'start of month')`), so every month here is too. */
function monthStart(period: Period) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (period === 'previous' ? 1 : 0), 1));
}

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

function PodiumColumn({ leader, xpUnit, narrow }: { leader: Leader; xpUnit: string; narrow: boolean }) {
  return (
    <div className={`lb-col lb-col--${leader.rank}`}>
      <div className="lb-avatar">
        <Avatar avatarKey={leader.avatarKey} size={narrow ? 56 : 78} square />
      </div>
      <div className="lb-name">
        {leader.displayName}
        {leader.hasShield && <VictoryShield size={16} />}
      </div>
      <div className="lb-box">
        <div className="lb-medal">
          <RankBadge tier={leader.rankTier} size={narrow ? 52 : 72} showName={false} />
        </div>
        <div className="lb-tier">
          <RankBadge tier={leader.rankTier} size={32} showIcon={false} />
        </div>
        <div className="lb-value">
          <XpIcon size={narrow ? 28 : 38} />
          {fmt(leader.xp)}
        </div>
        <div className="lb-unit">{xpUnit}</div>
      </div>
    </div>
  );
}

function LeaderRow({ leader, highlight }: { leader: Leader; highlight: boolean }) {
  return (
    <div className={`lb-row${highlight ? ' lb-row--me' : ''}`}>
      <span className="lb-rank">{leader.rank}</span>
      <div className="lb-user">
        <Avatar avatarKey={leader.avatarKey} size={34} />
        <div className="lb-user-text">
          <div className="lb-user-name">
            {leader.displayName}
            {leader.hasShield && <VictoryShield size={16} />}
          </div>
          <div className="lb-handle">
            <bdi dir="ltr">@{leader.username}</bdi>
          </div>
        </div>
      </div>
      <div className="lb-col-tier">
        <RankBadge tier={leader.rankTier} size={30} />
      </div>
      <div className="lb-points">
        <span className="lb-chip">
          <XpIcon size={28} />
          {fmt(leader.xp)}
        </span>
      </div>
    </div>
  );
}

function LeaderPager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  const { t, dir } = useLanguage();
  if (pages <= 1) return null;
  const Prev = dir === 'rtl' ? RiArrowRightSLine : RiArrowLeftSLine;
  const Next = dir === 'rtl' ? RiArrowLeftSLine : RiArrowRightSLine;
  return (
    <nav className="lb-pager">
      <button type="button" className="lb-page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('admin.paginationPrev')}>
        <Prev size={16} />
      </button>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" className={`lb-page-btn${n === page ? ' is-active' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
      <button type="button" className="lb-page-btn" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t('admin.paginationNext')}>
        <Next size={16} />
      </button>
    </nav>
  );
}

export function LeaderboardPage() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const narrow = useNarrow();
  const [period, setPeriod] = useState<Period>('current');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The previous board is the same endpoint with ?month=YYYY-MM; the old data stays on screen while it loads.
  useEffect(() => {
    let cancelled = false;
    setPage(1);
    api
      .get<LeaderboardResponse>(period === 'current' ? '/leaderboard' : `/leaderboard?month=${monthStart(period).toISOString().slice(0, 7)}`)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch(() => !cancelled && setError(t('leaderboard.loadError')));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const isTeacherBoard = data?.isTeacherBoard ?? user?.role === 'teacher';
  const monthLabel = monthStart(period).toLocaleString(lang === 'ar' ? 'ar-QA' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const xpUnit = isTeacherBoard ? t('common.pointsUnit') : t('common.xpUnit');
  const top3 = data?.leaders.slice(0, 3) ?? [];
  const rest = data?.leaders.slice(3) ?? [];
  const pages = Math.ceil(rest.length / PAGE_SIZE);
  const shown = rest.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="stack">
      <Topbar
        title={t('leaderboard.title')}
        subtitle={t(isTeacherBoard ? 'leaderboard.teacherSubtitle' : 'leaderboard.subtitle', { month: monthLabel })}
      />

      {error && <div className="form-error-banner">{error}</div>}

      <div className="lb">
        <div className="lb-toggle-wrap">
          <div className="lb-toggle" role="tablist">
            {(['current', 'previous'] as const).map((p) => (
              <button key={p} type="button" role="tab" aria-selected={period === p} className={period === p ? 'is-active' : undefined} onClick={() => setPeriod(p)}>
                {t(p === 'current' ? 'leaderboard.thisMonth' : 'leaderboard.lastMonth')}
              </button>
            ))}
          </div>
        </div>

        {!data && !error && (
          <div className="empty-state">
            <div className="spinner" />
          </div>
        )}

        {data && data.leaders.length === 0 && (
          <div className="empty-state">
            <div style={{ fontSize: 40 }}>🌱</div>
            <p>{t(isTeacherBoard ? 'leaderboard.teacherEmpty' : 'leaderboard.empty')}</p>
          </div>
        )}

        {top3.length > 0 && (
          <div className="lb-podium">
            {PODIUM_ORDER.map((rank) => {
              const leader = top3.find((l) => l.rank === rank);
              return leader ? <PodiumColumn key={rank} leader={leader} xpUnit={xpUnit} narrow={narrow} /> : <div key={rank} className="lb-col" />;
            })}
          </div>
        )}

        {data && data.leaders.length > 0 && data.me && (
          <div className="lb-note">
            {data.me.xp > 0 ? (
              <>
                <span>{t('leaderboard.noteEarned')}</span>
                <XpIcon size={28} />
                <b>{fmt(data.me.xp)}</b>
                <span>{t('leaderboard.noteMid', { month: monthLabel })}</span>
                <b>#{data.me.rank}</b>
                <span>{t('leaderboard.noteOutOf')}</span>
                <b>
                  {fmt(data.participants)} {t(`leaderboard.${isTeacherBoard ? 'noteTeacher' : 'noteStudent'}${data.participants === 1 ? '' : 's'}`)}
                </b>
              </>
            ) : (
              <span>{t('leaderboard.noteNone', { month: monthLabel })}</span>
            )}
          </div>
        )}

        {rest.length > 0 && (
          <>
            <div className="lb-rule" />
            <div className="lb-table">
              <div className="lb-head">
                <span>{t('leaderboard.colRank')}</span>
                <span>{t('leaderboard.colUser')}</span>
                <span className="lb-col-tier">{t('leaderboard.colTier')}</span>
                <span className="lb-points">{xpUnit}</span>
              </div>
              {shown.map((leader) => (
                <LeaderRow key={leader.username} leader={leader} highlight={leader.username === user?.username} />
              ))}
            </div>
            <LeaderPager page={page} pages={pages} onChange={setPage} />
          </>
        )}

        {data && data.me && !data.inTop20 && data.leaders.length > 0 && (
          <div className="lb-table">
            <p className="muted lb-yours">{t('leaderboard.yourRanking')}</p>
            <LeaderRow leader={data.me} highlight />
          </div>
        )}
      </div>
    </div>
  );
}
