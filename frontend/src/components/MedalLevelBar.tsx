import { useLanguage } from '../lib/language-context';
import { MEDAL_LEVELS, medalBarFraction, medalLevelFor, type MedalLevel } from '../lib/medalLevels';

// A student's points on a horizontal bar with three levels on it: Bronze (500), Silver (1000), Gold (2000). Everyone starts at Normal.
// The knob sits at the points, the level plaques light up as they are reached.

const LABEL_KEY = {
  normal: 'profile.medalNormal',
  bronze: 'profile.medalBronze',
  silver: 'profile.medalSilver',
  gold: 'profile.medalGold',
} as const satisfies Record<MedalLevel, string>;

export function MedalLevelBar({ points }: { points: number }) {
  const { t } = useLanguage();
  const level = medalLevelFor(points);
  const frac = medalBarFraction(points);
  const next = MEDAL_LEVELS.find((m) => points < m.at) ?? null;
  return (
    <div className="card stack medal-bar">
      <div className="flex-between" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>{t('profile.medalTitle')}</h3>
        <span className={`medal-level-pill medal-${level}`}>{t('profile.medalNow', { level: t(LABEL_KEY[level]) })}</span>
      </div>

      <div className="medal-track-wrap">
        <div className="medal-plaques" aria-hidden>
          {[{ key: 'normal' as const, at: 0 }, ...MEDAL_LEVELS].map((m, i) => (
            <div key={m.key} className={`medal-stop${points >= m.at ? ' is-reached' : ''}`} style={{ insetInlineStart: `${(i / MEDAL_LEVELS.length) * 100}%` }}>
              <img src={`/images/ranks/${m.key}.webp?v=2`} alt="" width={m.key === 'gold' ? 50 : 40} height={m.key === 'gold' ? 50 : 40} loading="lazy" decoding="async" />
              <b>{m.at}</b>
            </div>
          ))}
        </div>
        <div
          className="medal-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={MEDAL_LEVELS[MEDAL_LEVELS.length - 1].at}
          aria-valuenow={Math.min(points, MEDAL_LEVELS[MEDAL_LEVELS.length - 1].at)}
          aria-label={t('profile.medalTitle')}
        >
          <div className="medal-fill" style={{ clipPath: `inset(0 ${(1 - frac) * 100}% 0 0)` }} />
          {MEDAL_LEVELS.slice(0, -1).map((m, i) => (
            <span key={m.key} className="medal-tick" style={{ insetInlineStart: `${((i + 1) / MEDAL_LEVELS.length) * 100}%` }} />
          ))}
        </div>
        <div className="medal-knob" style={{ insetInlineStart: `${frac * 100}%` }}>
          <span>{points}</span>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        {next ? t('profile.medalToNext', { points: next.at - points, level: t(LABEL_KEY[next.key]) }) : t('profile.medalTop')}
      </p>
    </div>
  );
}
