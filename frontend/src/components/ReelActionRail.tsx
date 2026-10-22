import { RiPokerHeartsFill, RiPokerHeartsLine, RiVolumeMuteFill, RiVolumeUpFill, RiFileLine } from '@remixicon/react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../lib/language-context';
import { Avatar } from './Avatar';

/** TikTok-desktop-style action rail: sits OUTSIDE the reel frame (not overlaid on the video)
 * on desktop, always reflecting whichever reel is currently active. Rendered once by
 * ReelsPage, as a sibling of the Swiper frame, not per-slide. Below the mobile breakpoint
 * (theme.css) it switches to a real overlay on top of the frame instead -- there isn't
 * enough width for a video and a whole extra icon column side by side on a phone screen,
 * and that's exactly how TikTok's own mobile app places it too. */
export function ReelActionRail({
  author,
  liked,
  likeCount,
  onToggleLike,
  questionCount,
  onOpenQuiz,
  onOpenPointsInfo,
  muted,
  onToggleMute,
}: {
  author: { username: string; displayName: string; avatarKey: string; avatarUrl: string | null } | null;
  liked: boolean;
  likeCount: number;
  onToggleLike: () => void;
  questionCount: number;
  onOpenQuiz: () => void;
  onOpenPointsInfo: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="reel-action-rail flex-col flex-center gap-lg" style={{ paddingBottom: 28 }}>
      {/* The uploader, at the head of the rail: a link to their profile for a teacher's reel. The built-in
          lessons have no uploader to point to, so they carry the Anees mark instead. */}
      {author ? (
        <Link
          to={`/profile/${author.username}`}
          className="reel-rail-author"
          title={t('reels.lessonBy', { name: author.displayName })}
          aria-label={t('reels.lessonBy', { name: author.displayName })}
        >
          <Avatar avatarKey={author.avatarKey} photoUrl={author.avatarUrl} size={48} />
        </Link>
      ) : (
        <span className="reel-rail-brand" aria-hidden>
          <img src="/icons/logo-mark.png" alt="" />
        </span>
      )}

      <button type="button" className="reel-rail-btn" onClick={onToggleLike} aria-label={t(liked ? 'reels.unlike' : 'reels.like')}>
        <span
          className="notif-bell"
          style={{
            fontSize: 22,
            color: liked ? 'var(--danger)' : undefined,
            transform: liked ? 'scale(1.1)' : 'scale(1)',
            transition: 'transform 0.15s',
          }}
        >
          {liked ? <RiPokerHeartsFill size={22} /> : <RiPokerHeartsLine size={22} />}
        </span>
        <span className="reel-rail-count">{likeCount}</span>
      </button>

      <button type="button" className="reel-rail-btn" onClick={onToggleMute} aria-label={t(muted ? 'reels.unmute' : 'reels.mute')}>
        <span className="notif-bell" style={{ fontSize: 20 }}>
          {muted ? <RiVolumeMuteFill size={20} /> : <RiVolumeUpFill size={20} />}
        </span>
      </button>

      <button type="button" className="reel-rail-btn" onClick={onOpenQuiz} aria-label={t('reels.takeQuiz')}>
        <span className="notif-bell" style={{ fontSize: 19 }}>
          <RiFileLine size={19} />
        </span>
        <span className="reel-rail-count">{questionCount}</span>
      </button>

      <button type="button" className="reel-rail-btn" onClick={onOpenPointsInfo} aria-label={t('pointsInfo.title')}>
        <span className="notif-bell" style={{ fontSize: 19 }}>
          💎
        </span>
        <span className="reel-rail-count">{t('reels.xpTag')}</span>
      </button>

    </div>
  );
}
