import type { CSSProperties } from 'react';
import { useLanguage } from '../lib/language-context';

export type GradeFilter = 'all' | '5' | '8';

/** Identical grade-5/grade-8/all-grades filter used by both the admin user list
 * (AdminPage.tsx) and the watch-time report (AdminReportsPanel.tsx) -- one definition so
 * the two can't drift if a grade is ever added or renamed. */
export function GradeFilterSelect({
  value,
  onChange,
  style,
}: {
  value: GradeFilter;
  onChange: (value: GradeFilter) => void;
  style?: CSSProperties;
}) {
  const { t } = useLanguage();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as GradeFilter)} aria-label={t('admin.gradeFilterAll')} style={style}>
      <option value="all">{t('admin.gradeFilterAll')}</option>
      <option value="5">{t('admin.gradeFilter5')}</option>
      <option value="8">{t('admin.gradeFilter8')}</option>
    </select>
  );
}
