import { useEffect, useState } from 'react';
import { api } from './api';

// The rules students can break and what happens when they do. The list lives on the server (backend lib/violations.ts, what an admin's
// "record a rule" button really applies); this is the same list, fetched once, for the Terms page and the admin panel.
export type Measure = { deductPoints?: boolean; revoke?: 'unearned' | 'all'; suspendDays?: number; deactivate?: boolean };

export type Violation = {
  key: string;
  title: string;
  titleAr: string;
  example: string;
  exampleAr: string;
  steps: [Measure, Measure, Measure];
};

let loading: Promise<Violation[]> | null = null;

/** null while loading (or if it failed). */
export function useViolations(): Violation[] | null {
  const [rules, setRules] = useState<Violation[] | null>(null);
  useEffect(() => {
    loading ??= api.get<{ violations: Violation[] }>('/violations').then((d) => d.violations);
    let cancelled = false;
    loading.then((r) => !cancelled && setRules(r)).catch(() => (loading = null));
    return () => {
      cancelled = true;
    };
  }, []);
  return rules;
}

/** What a measure does, in words: "a warning · the unfair points are removed · account suspended for 7 days". */
export function describeMeasure(m: Measure, t: (path: string, vars?: Record<string, string | number>) => string): string {
  return [
    t('rules.warning'),
    m.deductPoints && t('rules.deductPoints'),
    m.revoke && t(m.revoke === 'all' ? 'rules.revokeAll' : 'rules.revokeUnearned'),
    m.suspendDays && t('rules.suspend', { n: m.suspendDays }),
    m.deactivate && t('rules.deactivate'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The "1st / 2nd / 3rd time" label for the n-th time a rule is broken (the third step covers every later time). */
export const offenseKey = (n: number) => (['rules.first', 'rules.second', 'rules.third'] as const)[Math.min(n, 3) - 1];
