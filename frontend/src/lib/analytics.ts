import { getConsent } from './cookie-consent';

// Route path template, not the raw URL -- /profile/:username collapses to a fixed string so
// a student's username never ends up in the pageview log (see backend/routes/analytics.ts).
function normalizePath(pathname: string): string {
  return pathname.startsWith('/profile/') ? '/profile/:username' : pathname;
}

/** First-party pageview count only -- see backend/src/routes/analytics.ts and schema.sql for
 * why this isn't a third-party script. Fire-and-forget: a failed/blocked request should never
 * affect the page, so nothing here is awaited or surfaced to the caller. */
export function trackPageview(pathname: string) {
  if (getConsent() !== 'accepted') return;
  fetch('/api/analytics/pageview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: normalizePath(pathname) }),
  }).catch(() => {});
}
