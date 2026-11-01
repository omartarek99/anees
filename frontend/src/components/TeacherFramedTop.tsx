import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { RANK_FRAMES } from '../lib/frames';
import { Topbar } from './Topbar';
import { ProfileAvatar3D } from './ProfileAvatar3D';
import type { AvatarConfig } from './avatar3d/avatarConfig';

type AvatarProfile = { avatarKey: string; avatarUrl?: string | null; avatar3d?: AvatarConfig | null };

// The top row of a teacher's home page: the top bar, and the teacher's picture in the frame of their rank (Teacher, Guide, Specialist, Expert,
// Professor, Consultant -- public/images/frames/teacher_*.png, sizes in lib/frames.ts). It uses the same .home-top / .home-avatar / .home-frame
// styles as the student's home page (HomePage.tsx), where the frame is a square image with a round hole for the picture.
export function TeacherFramedTop({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<AvatarProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 640px)').matches);

  useEffect(() => {
    api
      .get<{ profile: AvatarProfile }>('/users/me')
      .then((d) => setProfile(d.profile))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const rank = user?.rankTier.key;
  const fr = rank ? RANK_FRAMES[rank] : undefined;
  const hole = Math.round((fr?.hole ?? 132) * (narrow ? 0.62 : 1));
  const pic = Math.round(hole * 1.06);
  const top = { '--hole': `${hole}px`, '--frame': `${Math.round(fr ? hole / fr.ratio : hole * 1.45)}px` } as CSSProperties;
  // unlike the student's home page there is no hero to tuck under the frame, so the page just continues below it
  top.marginBlockEnd = 6;

  return (
    <div className="home-top" style={top}>
      <Topbar title={title} subtitle={subtitle} />
      <Link to="/profile" className="home-avatar" aria-label={t('home.myProfile')} title={t('home.myProfile')}>
        <span className="home-avatar-pic">
          {loaded ? (
            <ProfileAvatar3D avatarKey={profile?.avatarKey ?? user?.avatarKey ?? 'falcon'} photoUrl={profile?.avatarUrl} config={profile?.avatar3d ?? null} size={pic} />
          ) : (
            <span className="home-avatar-wait" style={{ width: pic, height: pic }} />
          )}
        </span>
        {rank && fr && <img className="home-frame" src={`/images/frames/${rank}.png`} alt="" decoding="async" />}
      </Link>
    </div>
  );
}
