import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RiLockFill } from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { useFeatures } from '../lib/features-context';
import { xpAtLevel, type Feature } from '../lib/levels';

/** A page a student's level has not opened yet: says at which level it opens and points at what earns points meanwhile. */
export function LevelGate({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { levelLock } = useFeatures();
  const level = levelLock(feature);
  if (level === null) return <>{children}</>;
  const card = (
    <div className="empty-state card stack level-gate">
      <span className="level-gate-icon" aria-hidden="true">
        <RiLockFill size={28} />
      </span>
      <h2>{t('levels.lockedTitle', { n: String(level) })}</h2>
      <p>{t(`levels.locked_${feature}`)}</p>
      {/* how close the student is: points still to earn, and a bar from the start to the level that opens this */}
      {(() => {
        const from = 0, to = xpAtLevel(level), xp = Math.min(to, Math.max(from, user!.totalXp));
        return (
          <div className="level-gate-progress">
            <p className="muted" style={{ margin: 0 }}>
              {t('levels.youAre', { n: String(user!.playerLevel) })} {t('levels.toGo', { xp: String(to - xp) })}
            </p>
            <div className="level-bar" role="progressbar" aria-valuemin={0} aria-valuemax={to - from} aria-valuenow={xp - from} aria-label={t('levels.lockedTitle', { n: String(level) })}>
              <span style={{ width: `${Math.round(((xp - from) / Math.max(1, to - from)) * 100)}%` }} />
            </div>
          </div>
        );
      })()}
      <div className="flex-center gap-md" style={{ flexWrap: 'wrap' }}>
        <Link to="/reels" className="btn btn-primary">
          {t('nav.reels')}
        </Link>
        <Link to="/worksheets" className="btn btn-secondary">
          {t('nav.worksheets')}
        </Link>
      </div>
    </div>
  );
  // the map and the quarry stay visible behind the lock window, so a student sees what is waiting at the next level
  if (feature === 'map' || feature === 'quarry') {
    return (
      <div className="level-gate-stage">
        <div className="level-gate-under" aria-hidden="true" {...{ inert: '' }}>
          {children}
        </div>
        <div className="level-gate-over">{card}</div>
      </div>
    );
  }
  return card;
}
