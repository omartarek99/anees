const STORAGE_KEY = 'anees_cookie_consent';

export type ConsentChoice = 'accepted' | 'declined';

/** The session cookie itself (auth) is strictly necessary and never gated by this -- consent
 * only controls whether the optional, first-party pageview analytics (lib/analytics.ts) run.
 * Declining doesn't block or degrade anything else in the app. */
export function getConsent(): ConsentChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'accepted' || v === 'declined' ? v : null;
  } catch {
    return null; // private browsing / storage blocked -- treat as "no choice made yet"
  }
}

export function setConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage blocked -- the banner will just reappear next visit, not a functional problem.
  }
}
