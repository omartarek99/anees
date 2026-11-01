import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { STUDENT_LADDER, TEACHER_LADDER, divisionLabel } from '../lib/medalLevels';
import { RankBadge, type RankTier } from './RankBadge';

// A student's (or, with `teacher`, a teacher's) rank on their profile: the eight tiers in a row (the ones reached are lit, the current one is ringed) and, under them, a bar
// for how far they are through their current division. Every division is the same number of points wide (250), so the bar always fills
// the same way; the climb gets harder because the questions do, not the points (see backend/src/lib/ranks.ts).

export function MedalLevelBar({ points, teacher = false }: { points: number; teacher?: boolean }) {
  const { t, lang } = useLanguage();
  const ladder = teacher ? TEACHER_LADDER : STUDENT_LADDER;
  const { tiers, divisions, tierStart } = ladder;
  const { current, next } = ladder.standingFor(points);
  const frac = ladder.lineFraction(points);
  return (
    // dir="ltr": the bar is laid out the same way in Arabic as in English (first rank on the left, the bar filling to the right); only the words are Arabic.
    <div className={`card stack medal-bar${teacher ? " is-teacher" : ""}`} dir="ltr">
      <div className="flex-between" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>{t('profile.medalTitle')}</h3>
        <span className="medal-level-pill" style={{ background: `linear-gradient(135deg, ${current.tier.color}, color-mix(in srgb, ${current.tier.color} 55%, ${current.tier.colorDark}))`, color: '#14181f' }}>
          {t('profile.medalNow', { level: divisionLabel(current, lang) })}
        </span>
      </div>

      {/* One line runs through the rank logos and is filled as far as the student has got: to a logo when they reach that rank, between two
          logos while they are between those ranks. Each rank's starting points are under its logo. */}
      <div className="medal-ladder" style={{ ['--n' as string]: tiers.length }}>
        <div className="medal-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)} aria-label={t('profile.medalTitle')}>
          <div className="medal-fill" style={{ width: `${frac * 100}%`, background: `linear-gradient(90deg, ${tiers[0].color}, ${current.tier.color})` }} />
          {/* A small vertical mark where each division after the first begins (a rank with 3 divisions has 2 marks between its logo and the next);
              lit once the student has reached it. Hover for the division and its points. */}
          {divisions.filter((d) => d.division && d.division > 1).map((d) => {
            const i = tiers.findIndex((t) => t.key === d.tier.key);
            return (
              <span
                key={d.index}
                className={`medal-mark${points >= d.start ? ' is-reached' : ''}`}
                style={{ left: `${((i + (d.division! - 1) / d.tier.divisions) / (tiers.length - 1)) * 100}%` }}
                title={`${divisionLabel(d, lang)} · ${d.start}`}
              />
            );
          })}
        </div>
        {tiers.map((tier, i) => {
          const reached = points >= tierStart[i];
          return (
            <div key={tier.key} className={`medal-tier${reached ? ' is-reached' : ''}${tier.key === current.tier.key ? ' is-current' : ''}`}>
              <RankBadge tier={{ ...tier, key: tier.key as RankTier['key'], minXp: 0, nextMinXp: null, progress: 0, division: null }} size={44} showName={false} />
              <span>{pickText(lang, tier.name, tier.nameAr)}</span>
              <b>{tierStart[i]}</b>
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        {next ? t('profile.medalToNext', { points: next.start - Math.max(0, points), level: divisionLabel(next, lang) }) : t('profile.medalTop')}
      </p>
    </div>
  );
}
