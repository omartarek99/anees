<div align="center">
  <img src="frontend/public/icons/icon-512.png" width="96" height="96" alt="Anees logo" />
  <h1>Anees 🦅</h1>
  <p><strong>A Qatari-themed Math &amp; Science learning platform for 5th-grade students</strong></p>
</div>

Students watch short lesson "reels" in a TikTok-style, full-screen vertical swipe feed, answer quizzes to earn XP, climb a 50-level 2D adventure map, defeat Guardian bosses every 5 levels, generate difficulty-tiered practice worksheets, add friends, and dig/build/craft in a Minecraft-style survival mini-game (the Quarry). Teachers get the same account as a student, plus the ability to author their own video lessons and post announcements. Admins get a dedicated dashboard to manage every account on the platform. Fully bilingual (Arabic/English, RTL-aware) with a light and dark theme.

## Table of Contents

- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Roles & Accounts](#roles--accounts)
- [Feature Map](#feature-map)
- [Teacher-Authored Reels & Video Pipeline](#teacher-authored-reels--video-pipeline)
- [Admin Dashboard](#admin-dashboard)
- [Content](#content)
- [Theming: Light & Dark Mode](#theming-light--dark-mode)
- [Language / Arabic Support](#language--arabic-support)
- [Security & Content Safety](#security--content-safety)
- [Known Scope Limits](#known-scope-limits-by-design)
- [Project Structure](#project-structure)

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite, React Router, Swiper (reels feed), Framer Motion (UI animation), Three.js (the Quarry mini-game)
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite via Node's built-in `node:sqlite` module (no native compilation, no external DB server needed)
- **Auth**: httpOnly session cookies (accounts/sessions owned by our own backend); Firebase Authentication verifies email/password and sends the confirmation email for new signups
- **Video processing**: `@ffmpeg-installer/ffmpeg` (bundles a platform-specific ffmpeg binary — nothing to install separately) re-encodes every teacher-uploaded lesson video server-side before it's stored, and `tesseract.js` runs local OCR on teacher ID photos at signup
- **`fastapi-backend/`**: a separate, optional Python (FastAPI + Supabase) service — see its own section below. Not required to run the main app.

No external network calls happen at runtime for the main app **except signup/login for real accounts** (Firebase, for credential verification and the confirmation email) **and teacher-uploaded content** (Supabase Storage, for lesson videos and ID photos) — everything else (seed-account login, reels, map, worksheets, craft, admin panel, etc.) works fully offline once dependencies are installed.

## Getting Started

### Prerequisites

- **Node.js 22.5+** (needed for the built-in `node:sqlite` module the backend uses). Tested on Node 24.
- npm (comes with Node).
- Python is **not** required unless you're also running the optional `fastapi-backend/` service (see below).

### Install & run

```bash
npm run install:all
npm run dev
```

`install:all` installs both the `backend/` and `frontend/` workspaces (the root itself only adds `concurrently`, which drives `dev`). `npm run dev` then starts both at once:
- Backend API on **http://localhost:4000** (auto-creates and seeds `backend/data/app.db` on first run — nothing to configure, no `.env` needed for the main app)
- Frontend on **http://localhost:5190** (Vite dev server, proxies `/api` to the backend — pinned off Vite's default 5173 to avoid colliding with other local projects)

Open **http://localhost:5190**.

> **Note:** `frontend/src/lib/dev-config.ts` has `DEV_BYPASS_LOGIN = true` by default, so a fresh run **skips the login screen** and auto-signs-in as the seeded `dev_student` account. Set it to `false` (or delete its usage in `auth-context.tsx`) to see the real login/signup flow instead.

### Seed accounts

One account of each role is always seeded, so every account type is testable immediately:

| Username | Password | Role |
|---|---|---|
| `dev_student` | `devpass123` | Student |
| `dev_teacher` | `teachpass123` | Teacher |
| `dev_admin` | `adminpass123` | Admin |

A handful of demo students (Rashid, Khalid, Hamad, Abdulaziz, Nasser, Jassim) are also pre-loaded so the Leaderboard and Friends features have something to show immediately. These are display-only "seed" accounts (`is_seed = 1`) and can't log in themselves.

To reset all data (accounts, progress, everything), stop the servers and delete `backend/data/`; it reseeds automatically on the next `npm run dev`.

### Signup verification (Firebase + Supabase)

New student/teacher signups (not the seeded accounts above, which are pre-verified)
must click a confirmation link before they can log in, and new **teacher** signups must
also attach a Qatar ID, which is automatically checked before the account is created —
see "Automated teacher ID check" below. Email/password and verification are handled by
**Firebase Authentication**; teacher ID photos and lesson videos are stored in
**Supabase** Storage (the same project `fastapi-backend/` uses).

1. In the Firebase console for your project → **Authentication → Sign-in method** →
   enable the **Email/Password** provider.
2. Project Settings (gear icon) → **General** tab → copy the **Web API Key**.
3. Copy `backend/.env.example` to `backend/.env` and fill in `FIREBASE_API_KEY` with
   that value, plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings →
   API in the Supabase dashboard). The service role key is only used server-side —
   never expose it to the frontend.
4. In Supabase, under **Storage**, create two buckets:
   - `teacher-id-documents` — leave **"Public bucket" unchecked**; ID photos are
     sensitive and must stay private. No RLS policies are needed since the backend only
     ever accesses it with the service role key (which bypasses RLS).
   - `videos` — **public**, since lesson videos need to be playable directly in the
     `<video>` tag. Teacher uploads live under a `teacher-reels/` prefix in this bucket.
5. Optionally set `FRONTEND_ORIGIN` in `backend/.env` if your frontend runs somewhere
   other than `http://localhost:5190` (see `backend/src/lib/config.ts`) — it's used both
   for the CORS allow-list and the link embedded in verification emails.
6. Optionally set `GEMINI_API_KEY` in `backend/.env` (from
   [Google AI Studio](https://aistudio.google.com/) → Get API key) to enable the
   "Auto-generate Questions" button in the teacher reel composer — see
   [below](#teacher-authored-reels--video-pipeline). Without it, that one button returns
   a clear error; everything else is unaffected.

Nothing else to configure — `localhost` is authorized in every Firebase project by
default, and Firebase's default verification email template needs no SMTP setup.

Without `backend/.env` filled in, the rest of the app (seed accounts, reels, map,
worksheets, craft, admin panel, etc.) still runs with zero config as before — only
signup, teacher ID upload, and teacher video upload fail gracefully with a clear error.

**Teacher ID review:** a teacher's uploaded ID is stored privately in the
`teacher-id-documents` bucket (path shown in `users.id_document_path`) purely for you,
the app owner, to review manually from the Supabase dashboard if you want a second look
— there's no in-app approval screen (though an admin can deactivate/ban an account at
any point, see [Admin Dashboard](#admin-dashboard)). A teacher account works normally
(once their email is verified) as long as it passed the automated check below.

**Automated teacher ID check:** signup runs the uploaded photo through local OCR
(`tesseract.js`, no external service, no account/cost) and rejects the signup outright
unless it can find the word "Qatar" on the card and a plausible date of birth showing
the person is 23 or older — the oldest date found on the card is treated as the date of
birth (a QID shows issue/expiry/DOB dates, and DOB is reliably the oldest of the three).
This is a **best-effort heuristic, not real document verification** — a blurry, rotated,
or low-light photo of a genuine, valid ID can be incorrectly rejected; ask the teacher to
retry with a clearer, well-lit photo of the whole card. Only JPG/PNG are accepted (no
PDF) since OCR needs a plain image. The first ID upload after a fresh install downloads
`tesseract.js`'s English OCR language data (a few MB, one-time, then cached). A file that
isn't actually a decodable image (a corrupt upload, or a spoofed upload trying to pass
something else off as a photo) is caught and rejected cleanly rather than crashing the
server — see [Security & Content Safety](#security--content-safety).

### Dev utility: deleting a test account

While testing signup, `backend/scripts/delete-user.ts` fully removes one account by
email — the local DB row, its Supabase-stored ID document (if any), and the Firebase
Auth user — so the same username/email is free to sign up with again. The same logic
also backs the admin dashboard's own delete-account action.

```bash
npm run admin:delete-user --prefix backend -- someone@example.com
```

Needs a Firebase service account key at `backend/secrets/firebase-service-account.json`
(Firebase Console → Project Settings → Service Accounts → Generate new private key).
This grants full admin access to the Firebase project — the path is gitignored; never
commit it. Without it, the script still cleans up the local DB row and Storage file, and
just skips the Firebase side.

### Optional: `fastapi-backend/` (Python + Supabase)

A separate FastAPI service for AI-assisted reel generation (MoviePy) that publishes to Supabase Storage and a `reels` table. It's independent of the main app above — skip this unless you specifically need it.

```bash
cd fastapi-backend
python -m venv .venv
.venv\Scripts\activate          # Windows; macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then fill in SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
uvicorn main:app --reload
```

Requires Python 3.10+ and your own Supabase project (URL + anon key + service role key, from Project Settings → API — see `fastapi-backend/.env.example`). `.env` is git-ignored; never commit real keys. Full details in `fastapi-backend/README.md`.

## Roles & Accounts

Every account is one of three roles, enforced both server-side (every route checks it — a role that reaches a route it shouldn't gets a real `403`, not just a hidden nav item) and in the UI (the sidebar only ever shows links relevant to your role):

| Role | Can do |
|---|---|
| **Student** | Everything in [Feature Map](#feature-map) below: reels, map, worksheets, the Quarry, leaderboard, friends. |
| **Teacher** | Everything a student can do, **plus**: ID-verified signup, authoring their own video lessons (`/teacher/reels`), and posting news/announcements. A teacher account is a student account with extras, not a separate walled-off experience — it shares the same XP, level, leaderboard rank, and friends list. |
| **Admin** | No gameplay surface at all — a dedicated dashboard (`/admin`) to manage every other account: activate/deactivate, change role, issue a warning, apply a timed suspension, edit XP, and moderate every teacher-uploaded video platform-wide. See [Admin Dashboard](#admin-dashboard). |

Deactivating or suspending an account takes effect **immediately** — every authenticated request re-checks account status, so an admin action ends an already-open session on its very next request, not just at a future login.

## Feature Map

| Page | Route | Who |
|---|---|---|
| Login / Signup | `/login`, `/signup` | Public — signup picks student or teacher; students also enter their grade, teachers upload a Qatar ID |
| Home / News feed | `/` | Student & teacher (filterable news feed; teachers get a composer here to post announcements) |
| Reels | `/reels` | Student & teacher — full-screen, TikTok-style vertical swipe feed; watch, quiz inline, feed grows as levels unlock |
| Adventure Map | `/map` | Student & teacher — 50-level 2D map, 5 themed zones, boss fights every 5 levels |
| The Quarry | `/craft` | Student & teacher — Minecraft-style survival mini-game: dig, gather ores, manage food/HP, build, craft |
| Worksheets | `/worksheets` | Student & teacher — generate easy/medium/hard practice sets per subject; XP scales with difficulty |
| Leaderboard | `/leaderboard` | Student & teacher — monthly top-XP ranking, medals for top 3 |
| Friends | `/friends` | Student & teacher — search accounts, send/accept friend requests |
| My Reels | `/teacher/reels` | Teacher only — create/edit/delete your own video lessons |
| Admin Dashboard | `/admin` | Admin only — manage every account and moderate every teacher video |
| Profile | `/profile`, `/profile/:username` | Everyone — XP, level, stats, bio, photo & display name editing on your own; view anyone else's (teachers' profiles also list their published videos) |

## Teacher-Authored Reels & Video Pipeline

Teachers can create their own lesson reels from `/teacher/reels`, each tagged to a **subject and a grade (1–12)** — decoupled from the 50-level map entirely, so a teacher isn't limited to the curriculum's existing level slots. A student sees any reel matching their own grade folded straight into their normal Reels feed, alongside the curriculum's own lessons. Quiz questions are optional — a reel can be video/script-only.

Every teacher's profile page (`/profile/:username`, open to any signed-in viewer) also lists their published reels as a portfolio, alongside their bio — so a student can look up a teacher and see what they've taught before watching.

Every uploaded video goes through the same pipeline before it's ever stored or shown to a student:

1. **Signature check** — the file's actual bytes are inspected (the same magic-number technique real file-type–detection libraries use), so a file that isn't really a video can't be stored under a spoofed `Content-Type`, no matter what the browser claims it is.
2. **Compression** — re-encoded server-side to H.264/AAC MP4, capped at 720px on the longer side and CRF 28, via the bundled ffmpeg binary. Typical uploads shrink dramatically with no visible quality loss at the size they're actually displayed.
3. **Storage** — uploaded to the public `videos` Supabase Storage bucket, replacing any previous video for that reel (the old file is cleaned up automatically).

**Auto-generate quiz questions** — writing a lesson script and clicking "🪄 Auto-generate Questions" sends the script (plus subject and grade) to Google Gemini, which returns a bilingual set of grounded multiple-choice questions straight into the editable question list. The teacher reviews and edits before saving; nothing is written to the database until then, and the AI output is re-validated through the exact same schema as manually-entered questions. A dedicated rate limit (15 requests / 15 minutes per IP) bounds cost exposure on this external-API-backed endpoint. Requires `GEMINI_API_KEY` in `backend/.env` (see `.env.example`) — without it, the button returns a clear error and manual question entry is unaffected.

## Admin Dashboard

The `/admin` dashboard has two tabs:

- **Users** — search/filter every real account by role. Per account:
  - **Role** — promote/demote between student, teacher, and admin.
  - **Active / Deactivated** — a manual, indefinite toggle.
  - **Points (XP)** — set a student's total XP directly.
  - **Warning** — send a message that pops up as a modal the next time that account loads any page, until they dismiss it.
  - **Suspension** — a *timed* ban (1/7/30 days, or a custom date) that auto-lifts itself — checked live against the current time, no background job needed — separate from the manual active/inactive toggle above.
- **Videos** — every teacher-authored reel platform-wide, with a live preview and a delete button, for moderating inappropriate content regardless of which teacher uploaded it.

An admin can't deactivate, suspend, re-role, or delete their **own** account — those actions are disabled in the UI and rejected by the API, so there's no way to accidentally lock yourself out.

## Content

- **Map levels 1–10** (alternating Math/Science, culminating in the Level 10 boss "The Guardian of Al Zubarah") are fully authored: lesson scripts + 4 quiz questions each, all fact-checked for grade-5 accuracy.
- **Levels 11–50** exist as real map nodes across 4 themed zones (Souq Quarter, Corniche Coast, Sky Observatory, Falcon's Peak) but are marked "Coming Soon" — the schema and seed script (`backend/src/db/seed.ts`) are ready for that content to be added without any code changes.
- **Worksheet bank** is fully populated and NOT level-gated: 12 questions × 2 subjects × 3 difficulties = 72 questions, sampled 8 at a time per generated worksheet.
- Seeded curriculum levels ship with no video by default (a friendly "video coming soon" placeholder shows instead) to avoid hot-linking external clips — set `video_url` in the database once real recorded lessons exist for them. Teacher-authored reels, by contrast, have a full upload-and-compress pipeline from day one — see [above](#teacher-authored-reels--video-pipeline).

## Theming: Light & Dark Mode

The whole app ships with both a light and a dark theme, toggled from the 🌙/☀️ button in the sidebar (or top-right on the login/signup screens). It defaults to the visitor's OS-level preference on first visit, then remembers an explicit choice in `localStorage`. Every color is a CSS custom property in `frontend/src/styles/theme.css`, with a dedicated dark-mode block redesigning each one for real (pale badge surfaces become dark tinted washes, brand colors get a contrast-safe brighten) rather than a flat invert.

The primary palette is a true Qatari maroon (`#8A1538`, matching the app icon and `<meta theme-color>`) paired with gold — glassmorphic cards, soft 3D shadows, and spring-eased hover/press feedback throughout.

## Language / Arabic Support

- The whole app — every page, button, form, error, and every quiz/lesson/news content item — is available in both **Arabic (default, RTL)** and **English (LTR)**. Toggle any time with the 🌐 button in the nav bar (or top-right on the login/signup screens); the choice is remembered in `localStorage` and switches instantly with no page reload or refetch, since the API returns both language variants of every content field and the frontend picks the right one live.
- `frontend/src/lib/i18n.ts` holds the full UI-string dictionary (`en`/`ar`, with TypeScript enforcing exact key parity between them) plus a lookup table that translates the backend's (English) error messages for display.
- Educational content is bilingual at the database level: every translatable column has a `_ar` counterpart (e.g. `reels.script_text` / `reels.script_text_ar`) populated in `backend/src/db/seed.ts`, and teacher-authored content follows the same pattern. New curriculum content (levels 11–50) should be added with both languages from the start to keep this consistent.
- RTL layout is applied via `dir="rtl"` on `<html>`, which flips flexbox/text-alignment automatically; spots that needed explicit fixes use CSS logical properties (`inset-inline-start`, `text-align: start`, etc.) so they mirror correctly in both directions.

## Security & Content Safety

- Real accounts' passwords are managed entirely by Firebase Authentication (never stored locally); the seeded demo accounts (which predate Firebase) still use a local bcrypt hash. Sessions are random tokens (only their hash is stored server-side, in a revocable `sessions` table) delivered via httpOnly, sameSite cookies.
- A custom-header check (`X-Requested-With`) is required on every mutating request as CSRF protection.
- Every API input is validated server-side with `zod`; all SQL is parameterized (no string-built queries).
- Rate limiting on login/signup.
- **Every username, display name, and teacher news/reel content field is run through a server-side moderation filter** (`backend/src/lib/moderation.ts`) before it's stored — never trust the client:
  - Normalizes leetspeak (`4→a`, `3→e`, `1→i`, `0→o`, `$→s`, …) and repeated letters, then checks against an English + Arabic profanity block list using whole-word matching (so words like "class" are never falsely flagged).
  - Also blocks text that looks like an attempt to share emails, phone numbers, or other-app handles ("add me on…", "my whatsapp is…") — split into a profanity-only variant for teacher lesson content, so legitimate math (e.g. "100 - 37") never false-positives on the phone-number pattern.
  - Blocked content is rejected outright and never written to the database.
- **Upload hardening**: a file's declared MIME type is never trusted on its own.
  - Teacher lesson videos are verified by their actual file signature before compression/storage — a non-video file can't be stored in the public bucket disguised as one.
  - Teacher ID photos that fail to decode as a real image (corrupt, or a spoofed upload) are caught and rejected with a clean error instead of crashing the OCR worker — closing what was previously an unauthenticated denial-of-service path on the public signup endpoint.
- Role-based access control across three roles (student/teacher/admin), enforced server-side on every route — a request that reaches a route its role shouldn't gets a real `403` from the API, not just a hidden nav item.
- Account status (active/deactivated, timed suspension) is re-checked on **every** authenticated request, not just at login — an admin action takes effect immediately, ending an already-open session on its very next request.
- An admin can never deactivate, suspend, re-role, or delete their own account, closing off any accidental admin self-lockout.

## Known Scope Limits (by design)

- Seeded curriculum levels ship without video by default (see [Content](#content)) — teacher-authored reels are not affected by this.
- Map levels 11–50 are visible but not yet content-authored.
- This is a local development app; no production deployment/hosting configuration is included.

## Project Structure

```
backend/src/
  db/          schema.sql, db.ts (init + migrations), seed.ts (all content)
  lib/         moderation.ts, xp.ts, session.ts, schemas.ts, config.ts (FRONTEND_ORIGIN),
               firebase.ts (Identity Toolkit REST client), supabase.ts, idVerification.ts
               (Qatar ID OCR check), videoCompression.ts (ffmpeg pipeline), reelVideo.ts,
               accountStatus.ts (ban/active checks), deleteUser.ts (shared delete logic)
  middleware/  auth.ts (requireAuth incl. active/ban check, requireRole), validate.ts,
               rateLimit.ts
  routes/      auth, users, reels, map, worksheets, leaderboard, friends, craft, news,
               teacherReels, admin
  index.ts     Express app entry, route mounting

frontend/src/
  pages/       one file per route (incl. TeacherHomePage, TeacherReelsPage, AdminPage)
  components/  Sidebar, Topbar, Avatar, ReelSlide, ReelActionRail, QuizCard, QuizResults,
               BossArena, LevelUpToast, NewsCard, CraftMenu, AuthShell, LanguageToggle,
               ThemeToggle, WarningModal, AdminUserRow, AdminVideosPanel
  lib/         api.ts (fetch wrapper), auth-context.tsx, language-context.tsx,
               theme-context.tsx (light/dark), i18n.ts (dictionary + error translation),
               craftWorld/craftItems/craftEntities/craftTextures.ts (the Quarry mini-game)
  styles/      theme.css (design tokens, light/dark, glassmorphism, RTL-aware)

fastapi-backend/   optional Python service — see "Getting Started" above
  main.py             FastAPI app + endpoints
  supabase_client.py  Supabase client setup
  reel_generator.py   MoviePy reel generation
```
