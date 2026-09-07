import { useLanguage } from '../lib/language-context';
import { Avatar } from './Avatar';

/** TikTok-desktop-style action rail: sits OUTSIDE the reel frame (not overlaid on the video),
 * always reflecting whichever reel is currently active. Rendered once by ReelsPage, as a sibling
 * of the Swiper frame, not per-slide. */
export function ReelActionRail({
  avatarKey,
  liked,
  likeCount,
  onToggleLike,
  questionCount,
  onOpenQuiz,
  subjectIcon,
}: {
  avatarKey: string;
  liked: boolean;
  likeCount: number;
  onToggleLike: () => void;
  questionCount: number;
  onOpenQuiz: () => void;
  subjectIcon: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex-col flex-center gap-lg" style={{ paddingBottom: 28 }}>
      <Avatar avatarKey={avatarKey} size={48} />

      <button type="button" className="reel-rail-btn" onClick={onToggleLike} aria-label={t(liked ? 'reels.unlike' : 'reels.like')}>
        <span className="notif-bell" style={{ fontSize: 22, transform: liked ? 'scale(1.1)' : 'scale(1)', transition: 'transform 0.15s' }}>
          {liked ? '❤️' : '🤍'}
        </span>
        <span className="reel-rail-count">{likeCount}</span>
      </button>

      <button type="button" className="reel-rail-btn" onClick={onOpenQuiz} aria-label={t('reels.takeQuiz')}>
        <span className="notif-bell" style={{ fontSize: 19 }}>
          📝
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
