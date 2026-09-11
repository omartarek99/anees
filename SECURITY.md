# Security notes

This file records security-relevant decisions that aren't obvious from the code alone --
particularly two places where the literal ask didn't map 1:1 onto this app's actual
architecture, and needed a real decision rather than a blind implementation.

## Row Level Security -- doesn't apply the way you might expect

**This app's primary database is SQLite** (`backend/data/app.db`, via Node's built-in
`node:sqlite`), not Postgres. Row Level Security is a Postgres feature; SQLite has no
equivalent concept, so "enable RLS on every table" isn't something that can be turned on
here -- there's no RLS to enable on a `users` or `reels` table that lives in SQLite.

The one thing in this app backed by Postgres is **Supabase Storage** (two buckets: private
`teacher-id-documents`, public `videos` -- see `backend/src/lib/supabase.ts`). Supabase
Storage objects do live in a Postgres table (`storage.objects`) that RLS could apply to --
but every access to it in this codebase goes through `supabaseAdmin`, the **service-role**
client (`backend/src/lib/supabase.ts`), and service-role requests always bypass RLS by
design. The frontend never talks to Supabase directly (no `VITE_*` Supabase env vars, no
`@supabase/supabase-js` import anywhere in `frontend/`, confirmed by grep) -- everything
goes through `/api/*` first. So RLS policies on `storage.objects` would have no effect on
how this app actually works today; they'd only matter if the frontend started calling
Supabase directly with a user's own (anon/authenticated) session, which it doesn't.

What actually protects this data today:
- **`teacher-id-documents` must be a *private* bucket** (not RLS -- a bucket-level setting)
  so nothing can read a teacher's ID photo except the backend's own service-role calls. This
  was the stated intent in `backend/.env.example`'s comments; verify it in the Supabase
  dashboard (Storage → that bucket → should show "Private").
- **`videos` is deliberately public** -- lesson videos are served straight to a `<video>`
  tag via `getPublicUrl()` (`backend/src/routes/teacherReels.ts`), so anyone with the exact
  URL can view a video. That's by design, not a gap: a published lesson isn't meant to be
  access-controlled per viewer.
- **SQLite's equivalent of "every table protected"** is the application-level authorization
  already in place on every route: the acting user's id always comes from the session
  (`req.userId`, set only by `requireAuth` from the session cookie -- see below), and every
  route that reads/writes a specific row checks it belongs to that user before acting
  (e.g. `backend/src/routes/worksheets.ts`'s `/:id/submit`, `friends.ts`'s
  accept/decline) or is admin-only (`middleware/auth.ts`'s `requireRole`). This was audited
  across every route file; the invariant holds everywhere.

## Encryption at rest

`users.email` is encrypted (AES-256-GCM, `backend/src/lib/encryption.ts`) using a key from
the required `ENCRYPTION_KEY` env var. `users.username` and `users.display_name` are
**not** encrypted -- deliberately: they're inherently public product surface (profile URLs
use username, display names show on leaderboards/friends/news bylines/reel authorship), so
encrypting them would break core features for no real privacy gain (they're already shown
to other users by design). Email is the one field that's genuinely sensitive PII and never
shown to anyone but its own owner (implicitly, never even returned by `/auth/me`) and
admins.

Because AES-GCM uses a random IV per encryption, the same email encrypts to different
ciphertext every time -- so `email` can no longer be used for uniqueness checks or lookups
directly. `users.email_hash` (an HMAC-SHA256 keyed by the same `ENCRYPTION_KEY`) is the
deterministic value those now use instead (signup uniqueness, login-adjacent lookups,
Firebase email verification lookup, account deletion by email). The admin panel's email
*search* still works via substring match -- it decrypts the already role/grade-filtered
rows (a handful to a few hundred accounts, not millions) and filters in application code,
which is fine at this app's real scale and doesn't need a searchable-encryption scheme.

`ENCRYPTION_KEY` is required at boot (`backend/src/lib/encryption.ts` throws immediately if
it's missing or malformed) -- unlike every other optional integration in this app (Firebase,
Supabase, Gemini all log a warning and no-op when unconfigured), this one can't degrade
gracefully once the schema has committed to encrypted email storage. A key was generated and
written to `backend/.env` (gitignored) so the app keeps working out of the box; **that key
is not backed up anywhere else** -- losing it makes every existing user's email permanently
unreadable. Treat it like any other secret you can't afford to lose.

## Everything else from this pass, for reference

- **Session-derived identity only**: audited every route file for any place the *acting*
  user's own id might come from the request instead of the session -- none found; `req.userId`
  (set only by `requireAuth` from the session cookie, never from a client-supplied field) is
  used everywhere, and every route touching a specific row checks ownership before acting.
- **No service-role key in the frontend bundle**: confirmed -- no `VITE_*` Supabase vars, no
  Supabase client import anywhere under `frontend/`. The frontend only ever calls `/api/*`.
- **Sign-out is server-side**: `POST /auth/logout` calls `destroySession()`, which deletes the
  session row from the `sessions` table (not just clearing the cookie) -- already correct.
- **One generic error for a wrong username or password**: already the case (`Incorrect
  username or password.` either way) -- hardened further by closing a *timing* side channel:
  a login attempt for a username that doesn't exist at all now burns the same bcrypt-compare
  cost as a real wrong-password check, so response time can't be used to enumerate accounts.
- **HTTPS enforced in production** (`backend/src/index.ts`): redirects to HTTPS and sends
  `Strict-Transport-Security`, both gated on `NODE_ENV=production` so local dev over plain
  HTTP still works (there's no TLS cert on localhost).
- **Spam protection**: a honeypot field (`website`) on signup -- invisible to a real person,
  filled in by generic form-filling bots. No CAPTCHA/third-party service, consistent with
  this app's zero-external-calls design.
- **Cookie consent banner**: added, gates the *optional* first-party analytics below --
  the session cookie itself is strictly necessary and was never gated by it.
- **Analytics**: intentionally first-party and self-hosted (`page_views` table,
  `backend/src/routes/analytics.ts`), not a third-party script -- this is a children's
  platform, and this app's own README already states "no external network calls" as a
  design goal; sending student usage data to Google/another tracker would contradict that
  for no real benefit an in-house pageview count doesn't already cover.
- **Watch-time anti-manipulation** (`backend/src/routes/reels.ts`): a forged request used to
  be able to claim a reel's full watch-XP allotment instantly and repeatedly. Each `/watch`
  call is now capped to roughly the real wall-clock time elapsed since the previous credited
  call for that (user, reel) pair -- spamming requests no longer helps, since two calls a
  second apart can jointly credit at most ~1 second of watch time regardless of what either
  claims.
