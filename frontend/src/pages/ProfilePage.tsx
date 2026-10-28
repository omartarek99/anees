import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RiCalculatorLine, RiAtomLine, RiPencilLine } from '@remixicon/react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText, translateApiError } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { ProfileAvatar3D } from '../components/ProfileAvatar3D';
import type { AvatarConfig } from '../components/avatar3d/avatarConfig';
import { RankBadge, type RankTier } from '../components/RankBadge';
import { MedalLevelBar } from '../components/MedalLevelBar';
import { Topbar } from '../components/Topbar';
import { VictoryShield } from '../components/VictoryShield';
import { CertificatePlaque } from '../components/CertificatePlaque';
import { CERT_PALETTES, CERT_TYPE_LABEL_KEY, certPillBackground, type CertificateType } from '../lib/certificateTiers';

type TeacherVideo = {
  id: number;
  title: string;
  titleAr?: string | null;
  videoUrl: string;
  grade: number | null;
  subject: { key: string; name: string; nameAr?: string | null; icon: string };
};

type Certificate = {
  id: number;
  title: string;
  type: CertificateType;
  imageUrl: string;
  issuedByName: string | null;
  createdAt: string;
};

type Profile = {
  username: string;
  displayName: string;
  hasShield?: boolean;
  avatarKey: string;
  avatarUrl: string | null;
  // The student's customised 3D character; null until they save one.
  avatar3d: AvatarConfig | null;
  role: 'student' | 'teacher' | 'admin';
  bio: string;
  // Teachers: public. Students: only present on their own profile.
  schoolName?: string | null;
  teacherSubject?: string | null;
  totalXp: number;
  // Separate currency from totalXp, only ever nonzero for teachers -- see backend
  // lib/xp.ts. Drives the teacher-only leaderboard and this profile's stats for teachers.
  teacherPoints: number;
  playerLevel: number;
  // 0..1 toward the next level (every 100 points for a student)
  levelProgress: number;
  rankTier: RankTier;
  levelsCompleted: number;
  bossesDefeated: number;
  worksheetsCompleted: number;
  videosCount: number;
  worksheetsPrintedCount: number;
  joinedAt: string;
  // Only present (and only ever populated) for teacher profiles -- their authored,
  // published reels, shown as a portfolio any signed-in viewer can browse.
  videos?: TeacherVideo[];
  // Admin-issued certificates (routes/admin.ts POST /certificates) -- shown to everyone
  // who can view this profile, same as videos above.
  certificates: Certificate[];
};

// Isolates the @handle as an LTR run so Arabic (RTL) text doesn't flip it to 'handle@'.
const LRI = '\u2066';
const PDI = '\u2069';

const STAT_COLORS = ['stat-card-yellow', 'stat-card-green'];

// Rank progress ring (replaces the old linear xp-bar) -- radius/circumference are shared
// between the track and fill circles so the fill's dash math stays in one place.
const RING_R = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number | string; color: string }) {
  return (
    <div className={`stat-card ${color}`}>
      <span className="stat-card-icon">{icon}</span>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
    </div>
  );
}

export function ProfilePage() {
  const { username } = useParams();
  const { user, refreshUser } = useAuth();
  const { t, lang } = useLanguage();
  const isOwnProfile = !username || username === user?.username;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function load() {
    const path = isOwnProfile ? '/users/me' : `/users/${username}`;
    api
      .get<{ profile: Profile }>(path)
      .then((d) => {
        setProfile(d.profile);
        setNameDraft(d.profile.displayName);
        setBioDraft(d.profile.bio);
      })
      .catch((err) => setError(err instanceof ApiError ? translateApiError(lang, err.message) : err.message));
  }

  useEffect(load, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveDisplayName() {
    if (!nameDraft.trim()) {
      setSaveError(t('profile.nameRequired'));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const data = await api.patch<{ profile: Profile }>('/users/me', { displayName: nameDraft.trim() });
      setProfile(data.profile);
      setEditingName(false);
      await refreshUser();
    } catch (err) {
      setSaveError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
    } finally {
      setSaving(false);
    }
  }

  // Throws on failure -- ProfileAvatar3D shows the error and keeps the customiser open.
  async function saveAvatar3d(avatar3d: AvatarConfig) {
    const data = await api.patch<{ profile: Profile }>('/users/me', { avatar3d });
    setProfile(data.profile);
  }

  async function saveBio() {
    setSaving(true);
    setSaveError(null);
    try {
      const data = await api.patch<{ profile: Profile }>('/users/me', { bio: bioDraft.trim() });
      setProfile(data.profile);
      setEditingBio(false);
    } catch (err) {
      setSaveError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    setSaveError(null);
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const data = await api.postForm<{ profile: Profile }>('/users/me/avatar', formData);
      setProfile(data.profile);
      await refreshUser();
    } catch (err) {
      setSaveError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  if (error) return <div className="form-error-banner">{error}</div>;
  if (!profile) {
    return (
      <div className="empty-state">
        <div className="spinner" />
      </div>
    );
  }

  const joinedDate = new Date(profile.joinedAt.replace(' ', 'T') + 'Z').toLocaleDateString(lang === 'ar' ? 'ar-QA' : 'en-US');

  return (
    <div className="stack">
      <Topbar
        title={
          editingName ? (
            <span className="flex gap-sm" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={40} autoFocus aria-label={t('profile.displayName')} style={{ fontSize: 16, minWidth: 160 }} />
              <button className="btn btn-primary btn-sm" onClick={saveDisplayName} disabled={saving}>
                {t('common.save')}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(profile.displayName);
                }}
              >
                {t('common.cancel')}
              </button>
            </span>
          ) : (
            <>
              {profile.displayName}
              {profile.hasShield && <VictoryShield size={26} />}
              {isOwnProfile && (
                <button type="button" className="pen-btn" aria-label={t('common.change')} title={t('common.change')} onClick={() => setEditingName(true)}>
                  <RiPencilLine size={16} />
                </button>
              )}
            </>
          )
        } subtitle={`${LRI}@${profile.username}${PDI} · ${t('profile.joined', { date: joinedDate })}`} />

      {saveError && <div className="form-error-banner">{saveError}</div>}

      {(profile.schoolName || profile.teacherSubject) && (
        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
          {profile.teacherSubject && (
            <span className="badge badge-gold">
              🧑‍🏫 {t('profile.teachesSubject')} {t(`auth.subject_${profile.teacherSubject}` as 'auth.subject_math')}
            </span>
          )}
          {profile.schoolName && (
            <span className="badge badge-gold">
              🏫 {t('profile.school')}: {profile.schoolName}
            </span>
          )}
        </div>
      )}

      <div className="card flex gap-md" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="avatar-edit-wrap">
          {(profile.role === 'student' || profile.role === 'teacher') && (isOwnProfile || profile.avatar3d) ? (
            <ProfileAvatar3D
              avatarKey={profile.avatarKey}
              photoUrl={profile.avatarUrl}
              config={profile.avatar3d}
              size={72}
              onSave={isOwnProfile ? saveAvatar3d : undefined}
            />
          ) : (
            <Avatar avatarKey={profile.avatarKey} photoUrl={profile.avatarUrl} size={72} />
          )}
          {/* A small + on the top left of the picture: one click opens the photo picker. (The "customize character" button stays under the picture.) */}
          {isOwnProfile && (
            <div className="avatar-plus-wrap">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhoto(file);
                }}
              />
              <button type="button" className="avatar-plus" aria-label={t('profile.changePhoto')} title={t('profile.changePhoto')} disabled={uploadingPhoto} onClick={() => photoInputRef.current?.click()}>
                {uploadingPhoto ? '…' : '+'}
              </button>
            </div>
          )}
        </div>

        {/* Admin accounts have no level / rank / XP -- only the avatar and name. */}
        {profile.role !== 'admin' && (
        <div className="flex gap-md" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
            <svg width={84} height={84} viewBox="0 0 84 84" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx={42} cy={42} r={RING_R} fill="none" stroke="var(--sand-dark)" strokeWidth={8} />
              <circle
                cx={42}
                cy={42}
                r={RING_R}
                fill="none"
                stroke={profile.rankTier.color}
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - profile.levelProgress)}
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{profile.playerLevel}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: 'var(--ink-soft)' }}>{t('common.level').toUpperCase()}</span>
            </div>
          </div>

          <div className="stack" style={{ gap: 4 }}>
            <RankBadge tier={profile.rankTier} size={44} />
            {profile.role === 'teacher' ? (
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                🏆 {profile.teacherPoints} {t('profile.teacherPoints')}
              </span>
            ) : (
              <>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  ⭐ {profile.totalXp} {t('profile.totalXp')}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  📚 {profile.levelsCompleted} {t('profile.levelsCompleted')}
                </span>
              </>
            )}
            {profile.rankTier.nextMinXp !== null && (
              <p className="muted" style={{ fontSize: 11, margin: 0 }}>
                {t(profile.role === 'teacher' ? 'profile.nextTierPoints' : 'profile.nextTierXp', {
                  xp: profile.rankTier.nextMinXp - (profile.role === 'teacher' ? profile.teacherPoints : profile.totalXp),
                })}
              </p>
            )}
          </div>
        </div>
        )}
      </div>

      <div className="card stack" style={{ gap: 6 }}>
        <div className="flex-between" style={{ alignItems: 'center' }}>
          <h3 style={{ fontSize: 16, margin: 0 }}>{t('profile.bio')}</h3>
          {isOwnProfile && !editingBio && (
            <button type="button" className="pen-btn" aria-label={t('common.change')} title={t('common.change')} onClick={() => setEditingBio(true)}>
              <RiPencilLine size={16} />
            </button>
          )}
        </div>
        {editingBio ? (
          <div className="stack" style={{ gap: 6 }}>
            <textarea value={bioDraft} onChange={(e) => setBioDraft(e.target.value)} maxLength={300} rows={4} placeholder={t('profile.bioPlaceholder')} />
            <div className="flex gap-sm">
              <button className="btn btn-primary btn-sm" onClick={saveBio} disabled={saving}>
                {t('common.save')}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditingBio(false);
                  setBioDraft(profile.bio);
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <p className={profile.bio ? undefined : 'muted'} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {profile.bio || t('profile.noBioYet')}
          </p>
        )}
      </div>

      {profile.role !== 'admin' && (
      <div className="grid-cards">
        {profile.role === 'teacher' ? (
          <>
            <StatCard icon="🎬" label={t('profile.totalVideos')} value={profile.videosCount} color={STAT_COLORS[0]} />
            <StatCard icon="🖨️" label={t('profile.worksheetsPrinted')} value={profile.worksheetsPrintedCount} color={STAT_COLORS[1]} />
          </>
        ) : (
          <>
            <StatCard icon="🐉" label={t('profile.bossesDefeated')} value={profile.bossesDefeated} color={STAT_COLORS[0]} />
            <StatCard icon="📝" label={t('profile.worksheetsDone')} value={profile.worksheetsCompleted} color={STAT_COLORS[1]} />
          </>
        )}
      </div>
      )}

      {profile.role === 'student' && <MedalLevelBar points={profile.totalXp} />}

      {profile.certificates.length > 0 && (
        <div className="card stack">
          <h3 style={{ fontSize: 16 }}>{t('profile.certificates')}</h3>
          <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {profile.certificates.map((cert) => (
              <div key={cert.id} className="card stack" style={{ gap: 6, padding: 14 }}>
                <a href={cert.imageUrl} target="_blank" rel="noreferrer">
                  <img
                    src={cert.imageUrl}
                    alt={cert.title}
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', borderRadius: 'var(--radius-sm)', aspectRatio: '4 / 3', objectFit: 'contain', background: 'var(--sand)' }}
                  />
                </a>
                <span className="flex gap-sm" style={{ alignItems: 'center' }}>
                <CertificatePlaque tier={cert.type} label={t(CERT_TYPE_LABEL_KEY[cert.type])} width={36} interactive={false} />
                <span
                  style={{
                    width: 'fit-content',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    color: CERT_PALETTES[cert.type].ink,
                    background: certPillBackground(cert.type),
                  }}
                >
                  {t(CERT_TYPE_LABEL_KEY[cert.type])}
                </span>
                </span>
                <strong style={{ fontSize: 14 }}>{cert.title}</strong>
                {cert.issuedByName && (
                  <p className="muted" style={{ fontSize: 11, margin: 0 }}>
                    {t('profile.certificateFrom', { name: cert.issuedByName })}
                  </p>
                )}
                <a
                  href={cert.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ width: 'fit-content', textDecoration: 'none' }}
                >
                  {t('profile.openCertificate')}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.role === 'teacher' && (
        <div className="card stack">
          <h3 style={{ fontSize: 16 }}>{t('profile.videos')}</h3>
          {!profile.videos || profile.videos.length === 0 ? (
            <p className="muted">{t('profile.noVideosYet')}</p>
          ) : (
            <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {profile.videos.map((video) => (
                <div key={video.id} className="card stack" style={{ gap: 8, padding: 12 }}>
                  <video src={video.videoUrl} controls playsInline style={{ width: '100%', borderRadius: 'var(--radius-sm)', aspectRatio: '9 / 16', objectFit: 'cover', background: '#0b0b0f' }} />
                  <span className="badge" style={{ width: 'fit-content', fontSize: 12 }}>
                    {video.subject.key === 'math' ? (
                      <RiCalculatorLine size={13} />
                    ) : video.subject.key === 'science' ? (
                      <RiAtomLine size={13} />
                    ) : (
                      video.subject.icon
                    )}{' '}
                    {pickText(lang, video.subject.name, video.subject.nameAr)}
                  </span>
                  <strong style={{ fontSize: 14 }}>{pickText(lang, video.title, video.titleAr)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
