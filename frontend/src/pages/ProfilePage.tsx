import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RiCalculatorLine } from '@remixicon/react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText, translateApiError } from '../lib/i18n';
import { Avatar, AVATAR_OPTIONS, avatarLabel } from '../components/Avatar';
import { RankBadge, type RankTier } from '../components/RankBadge';
import { Topbar } from '../components/Topbar';

type TeacherVideo = {
  id: number;
  title: string;
  titleAr?: string | null;
  videoUrl: string;
  grade: number | null;
  subject: { key: string; name: string; nameAr?: string | null; icon: string };
};

type Profile = {
  username: string;
  displayName: string;
  avatarKey: string;
  avatarUrl: string | null;
  role: 'student' | 'teacher' | 'admin';
  bio: string;
  totalXp: number;
  playerLevel: number;
  rankTier: RankTier;
  levelsCompleted: number;
  bossesDefeated: number;
  worksheetsCompleted: number;
  joinedAt: string;
  // Only present (and only ever populated) for teacher profiles -- their authored,
  // published reels, shown as a portfolio any signed-in viewer can browse.
  videos?: TeacherVideo[];
};

const STAT_COLORS = ['stat-card-blue', 'stat-card-yellow', 'stat-card-green', 'stat-card-pink'];

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
    if (!nameDraft.trim()) return;
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

  async function changeAvatar(avatarKey: string) {
    try {
      const data = await api.patch<{ profile: Profile }>('/users/me', { avatarKey });
      setProfile(data.profile);
      await refreshUser();
    } catch (err) {
      setSaveError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
    }
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
      <Topbar title={profile.displayName} subtitle={`@${profile.username} · ${t('profile.joined', { date: joinedDate })}`} />

      <div className="card flex gap-md" style={{ alignItems: 'center' }}>
        <Avatar avatarKey={profile.avatarKey} photoUrl={profile.avatarUrl} size={72} />
        <div className="stack" style={{ gap: 8, flex: 1 }}>
          <span className="badge badge-gold" style={{ fontSize: 15, width: 'fit-content' }}>
            {t('profile.levelXp', { level: profile.playerLevel, xp: profile.totalXp })}
          </span>
          <RankBadge tier={profile.rankTier} size={36} />
          {profile.rankTier.nextMinXp !== null && (
            <div style={{ maxWidth: 220 }}>
              <div className="xp-bar-track">
                <div
                  className="xp-bar-fill"
                  style={{
                    width: `${Math.round(profile.rankTier.progress * 100)}%`,
                    background: `linear-gradient(90deg, ${profile.rankTier.color}, ${profile.rankTier.colorDark})`,
                  }}
                />
              </div>
              <p className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                {t('profile.nextTierXp', { xp: profile.rankTier.nextMinXp - profile.totalXp })}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid-cards">
        <StatCard icon="📚" label={t('profile.levelsCompleted')} value={profile.levelsCompleted} color={STAT_COLORS[0]} />
        <StatCard icon="🐉" label={t('profile.bossesDefeated')} value={profile.bossesDefeated} color={STAT_COLORS[1]} />
        <StatCard icon="📝" label={t('profile.worksheetsDone')} value={profile.worksheetsCompleted} color={STAT_COLORS[2]} />
        <StatCard icon="⭐" label={t('profile.totalXp')} value={profile.totalXp} color={STAT_COLORS[3]} />
      </div>

      <div className="card stack" style={{ gap: 6 }}>
        <h3 style={{ fontSize: 16 }}>{t('profile.bio')}</h3>
        <p className={profile.bio ? undefined : 'muted'} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {profile.bio || t('profile.noBioYet')}
        </p>
      </div>

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
                    {video.subject.key === 'math' ? <RiCalculatorLine size={13} /> : video.subject.icon}{' '}
                    {pickText(lang, video.subject.name, video.subject.nameAr)}
                  </span>
                  <strong style={{ fontSize: 14 }}>{pickText(lang, video.title, video.titleAr)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isOwnProfile && (
        <div className="card stack">
          <h3 style={{ fontSize: 16 }}>{t('profile.editProfile')}</h3>
          {saveError && <div className="form-error-banner">{saveError}</div>}

          <div className="field">
            <label>{t('profile.displayName')}</label>
            {editingName ? (
              <div className="flex gap-sm">
                <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={40} />
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
              </div>
            ) : (
              <div className="flex-between">
                <span>{profile.displayName}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingName(true)}>
                  {t('common.change')}
                </button>
              </div>
            )}
          </div>

          <div className="field">
            <label>{t('profile.bio')}</label>
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
              <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                <span style={{ whiteSpace: 'pre-wrap' }}>{profile.bio || t('profile.noBioYet')}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingBio(true)}>
                  {t('common.change')}
                </button>
              </div>
            )}
          </div>

          <div className="field">
            <label>{t('profile.avatar')}</label>
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
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ width: 'fit-content', marginBottom: 10 }}
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? t('profile.uploadingPhoto') : t('profile.changePhoto')}
            </button>
            <div className="flex gap-md" style={{ flexWrap: 'wrap' }}>
              {AVATAR_OPTIONS.map((key) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => changeAvatar(key)}
                  className="badge-circle-wrap"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <div style={{ borderRadius: '50%', border: profile.avatarKey === key && !profile.avatarUrl ? '3px solid var(--maroon)' : '3px solid transparent', padding: 2 }}>
                    <Avatar avatarKey={key} size={48} />
                  </div>
                  <span className="badge-circle-label">{avatarLabel(key, lang)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
