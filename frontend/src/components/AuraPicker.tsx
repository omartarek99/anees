import { useState } from 'react';
import { RiLockLine } from '@remixicon/react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { RANK_LADDER, rankName, type RankKey } from '../lib/medalLevels';

// "Page colours" on a student's own profile: the site takes the colour of their rank (RankAura.tsx), and here they can pick the colour of
// any rank they have reached instead -- or go back to "my rank", which follows them as they climb. The server checks the pick is a rank
// they have reached (routes/users.ts); the ranks above theirs are shown locked.
export function AuraPicker() {
  const { user, refreshUser } = useAuth();
  const { t, lang } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user || user.role !== 'student') return null;

  const current = user.rankTier.key as RankKey;
  const reached = RANK_LADDER.findIndex((r) => r.key === current);
  const picked = user.auraRank ?? null;

  async function pick(auraRank: RankKey | null) {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/users/me', { auraRank });
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card stack aura-picker">
      <div>
        <h3 style={{ fontSize: 16, margin: 0 }}>{t('profile.auraTitle')}</h3>
        <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>{t('profile.auraHint')}</p>
      </div>
      <div className="aura-options" role="group" aria-label={t('profile.auraTitle')}>
        <button type="button" className="aura-option" data-rank={current} aria-pressed={picked === null} disabled={saving} onClick={() => pick(null)}>
          <span className="rank-swatch" />
          <span>{t('profile.auraAuto')}</span>
          <small>{t('profile.auraAutoHint')}</small>
        </button>
        {RANK_LADDER.map((r, i) => {
          const locked = i > reached;
          return (
            <button
              key={r.key}
              type="button"
              className={`aura-option${locked ? ' is-locked' : ''}`}
              data-rank={r.key}
              aria-pressed={picked === r.key}
              disabled={locked || saving}
              title={locked ? t('profile.auraLocked', { rank: rankName(r.key, lang) }) : undefined}
              onClick={() => pick(r.key)}
            >
              <span className="rank-swatch">{locked && <RiLockLine size={18} aria-hidden />}</span>
              <span>{rankName(r.key, lang)}</span>
            </button>
          );
        })}
      </div>
      {error && <div className="form-error-banner">{error}</div>}
    </div>
  );
}
