import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { Avatar, AVATAR_OPTIONS, avatarLabel } from '../components/Avatar';
import { RankBadge, type RankTier } from '../components/RankBadge';
import { Topbar } from '../components/Topbar';

type Profile = {
  username: string;
  displayName: string;
  avatarKey: string;
  totalXp: number;
  playerLevel: number;
  rankTier: RankTier;
  levelsCompleted: number;
  bossesDefeated: number;
  worksheetsCompleted: number;
  joinedAt: string;
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    const path = isOwnProfile ? '/users/me' : `/users/${username}`;
    api
      .get<{ profile: Profile }>(path)
      .then((d) => {
        setProfile(d.profile);
        setNameDraft(d.profile.displayName);
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
        <Avatar avatarKey={profile.avatarKey} size={72} />
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
            <label>{t('profile.avatar')}</label>
            <div className="flex gap-md" style={{ flexWrap: 'wrap' }}>
              {AVATAR_OPTIONS.map((key) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => changeAvatar(key)}
                  className="badge-circle-wrap"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <div style={{ borderRadius: '50%', border: profile.avatarKey === key ? '3px solid var(--maroon)' : '3px solid transparent', padding: 2 }}>
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
