// Single source of truth for the frontend dev server's origin -- used both for the CORS
// allow-list (index.ts) and the link embedded in verification emails (routes/auth.ts).
// Previously each file hardcoded its own fallback and they drifted (one said 5190, the
// other still said Vite's 5173 default) after the frontend's port moved; import this
// instead of redeclaring the default.
// No trailing slash: it is used for the CORS allow-list and to build links (".../verify-email"), and a
// pasted "https://site.vercel.app/" would otherwise give "https://site.vercel.app//verify-email".
export const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5190').trim().replace(/\/+$/, '');
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_ORIGIN) {
  console.warn('[config] FRONTEND_ORIGIN is not set in production -- CORS and verification-email links will point at http://localhost:5190.');
}
