import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { DIVISIONS, POINTS_PER_DIVISION, RANK_LADDER, divisionLabel, standingFor } from '../lib/medalLevels';
import { RankBadge } from './RankBadge';

// A student's rank on their profile: the eight tiers in a row (the ones reached are lit, the current one is ringed) and, under them, a bar
// for how far they are through their current division. Every division is the same number of points wide (250), so the bar always fills
// the same way; the climb gets harder because the questions do, not the points (see backend/src/lib/ranks.ts).

export function MedalLevelBar({ points }: { points: number }) {
  const { t, lang } = useLanguage();
  const { current, next, progress } = standingFor(points);
  const into = Math.max(0, points) - current.start;
  return (
    <div className="card stack medal-bar">
      <div className="flex-between" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>{t('profile.medalTitle')}</h3>
        <span className="medal-level-pill" style={{ background: `linear-gradient(135deg, ${current.tier.color}, color-mix(in srgb, ${current.tier.color} 55%, ${current.tier.colorDark}))`, color: '#14181f' }}>
          {t('profile.medalNow', { level: divisionLabel(current, lang) })}
        </span>
      </div>

      <div className="medal-tiers">
        {RANK_LADDER.map((tier) => {
          const reached = points >= DIVISIONS.find((d) => d.tier.key === tier.key)!.start;
          return (
            <div key={tier.key} className={`medal-tier${reached ? ' is-reached' : ''}${tier.key === current.tier.key ? ' is-current' : ''}`}>
              <RankBadge tier={{ ...tier, name: tier.name, minXp: 0, nextMinXp: null, progress: 0, division: null }} size={38} showName={false} />
              <span>{pickText(lang, tier.name, tier.nameAr)}</span>
            </div>
          );
        })}
      </div>

      <div className="medal-division">
        <div className="medal-division-labels">
          <b>{divisionLabel(current, lang)}</b>
          <span>{next ? `${Math.min(into, POINTS_PER_DIVISION)} / ${POINTS_PER_DIVISION}` : points}</span>
          {next && <b>{divisionLabel(next, lang)}</b>}
        </div>
        <div
          className="medal-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={POINTS_PER_DIVISION}
          aria-valuenow={Math.min(into, POINTS_PER_DIVISION)}
          aria-label={t('profile.medalTitle')}
        >
          <div className="medal-fill" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${current.tier.colorDark}, ${current.tier.color})` }} />
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        {next ? t('profile.medalToNext', { points: next.start - Math.max(0, points), level: divisionLabel(next, lang) }) : t('profile.medalTop')}
      </p>
    </div>
  );
}
