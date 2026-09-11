import { RiPokerHeartsFill, RiPokerHeartsLine, RiVolumeMuteFill, RiVolumeUpFill, RiFileLine } from '@remixicon/react';
import { useLanguage } from '../lib/language-context';
import { Avatar } from './Avatar';

/** TikTok-desktop-style action rail: sits OUTSIDE the reel frame (not overlaid on the video)
 * on desktop, always reflecting whichever reel is currently active. Rendered once by
 * ReelsPage, as a sibling of the Swiper frame, not per-slide. Below the mobile breakpoint
 * (theme.css) it switches to a real overlay on top of the frame instead -- there isn't
 * enough width for a video and a whole extra icon column side by side on a phone screen,
 * and that's exactly how TikTok's own mobile app places it too. */
export function ReelActionRail({
  avatarKey,
  liked,
  likeCount,
  onToggleLike,
  questionCount,
  onOpenQuiz,
  subjectIcon,
  muted,
  onToggleMute,
}: {
  avatarKey: string;
  liked: boolean;
  likeCount: number;
  onToggleLike: () => void;
  questionCount: number;
  onOpenQuiz: () => void;
  subjectIcon: string;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="reel-action-rail flex-col flex-center gap-lg" style={{ paddingBottom: 28 }}>
      <Avatar avatarKey={avatarKey} size={48} />

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

      <div className="reel-rail-btn">
        <span className="notif-bell" style={{ fontSize: 19 }}>
          💎
        </span>
        <span className="reel-rail-count">{t('reels.xpTag')}</span>
      </div>

      <span className="notif-bell" aria-hidden style={{ fontSize: 18 }}>
        {subjectIcon}
      </span>
    </div>
  );
}
