import type { Lang } from './i18n';

const EN = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
const AR = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];

/** "First warning" / "التحذير الأول": the label of an admin warning by its number (1, 2, 3 ...). */
export function warningName(n: number, lang: Lang): string {
  if (lang === 'ar') return n >= 1 && n <= AR.length ? `التحذير ${AR[n - 1]}` : `التحذير رقم ${n}`;
  return n >= 1 && n <= EN.length ? `${EN[n - 1]} warning` : `Warning #${n}`;
}
