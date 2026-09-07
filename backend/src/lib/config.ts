// Single source of truth for the frontend dev server's origin -- used both for the CORS
// allow-list (index.ts) and the link embedded in verification emails (routes/auth.ts).
// Previously each file hardcoded its own fallback and they drifted (one said 5190, the
// other still said Vite's 5173 default) after the frontend's port moved; import this
// instead of redeclaring the default.
export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5190';
