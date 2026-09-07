# Anees 🦅

A Qatari-themed Math & Science learning platform for 5th-grade students. Students watch short lesson "reels" in a TikTok-style vertical swipe feed, answer quizzes to earn XP, climb a 50-level 2D adventure map, defeat Guardian bosses every 5 levels, generate difficulty-tiered practice worksheets, add friends, and dig/build/craft in a Minecraft-style survival mini-game (the Quarry). Teachers get a separate account type to post announcements/study material to the student news feed. Fully bilingual (Arabic/English) with right-to-left layout.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite, React Router, Swiper (reels feed), Framer Motion (UI animation), Three.js (the Quarry mini-game)
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite via Node's built-in `node:sqlite` module (no native compilation, no external DB server needed)
- **Auth**: httpOnly session cookies (accounts/sessions owned by our own backend); Firebase Authentication verifies email/password and sends the confirmation email for new signups
- **`fastapi-backend/`**: a separate, optional Python (FastAPI + Supabase) service — see its own section below. Not required to run the main app.

No external network calls happen at runtime for the main app (including "video" content — see Scope below) **except signup and login for real accounts**, which reach Firebase to verify credentials/send the email confirmation link (see "Signup verification" below) — everything else (seed-account login, reels, map, worksheets, craft, etc.) works fully offline once dependencies are installed.

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
- Frontend on **http://localhost:5190** (Vite dev server, proxies `/api` to the backend)

Open **http://localhost:5190**.

> **Note:** `frontend/src/lib/dev-config.ts` has `DEV_BYPASS_LOGIN = true` by default, so a fresh run **skips the login screen** and auto-signs-in as the seeded `dev_student` account. Set it to `false` (or delete its usage in `auth-context.tsx`) to see the real login/signup flow instead.

### Seed accounts

A student and a teacher account are always seeded, so both account types are testable immediately:

| Username | Password | Role |
|---|---|---|
| `dev_student` | `devpass123` | Student |
| `dev_teacher` | `teachpass123` | Teacher |

A handful of demo students (Rashid, Khalid, Hamad, Abdulaziz, Nasser, Jassim) are also pre-loaded so the Leaderboard and Friends features have something to show immediately.

To reset all data (accounts, progress, everything), stop the servers and delete `backend/data/`; it reseeds automatically on the next `npm run dev`.

### Signup verification (Firebase + Supabase)

New student/teacher signups (not the seeded accounts above, which are pre-verified)
must click a confirmation link before they can log in, and new **teacher** signups must
also attach a Qatar ID, which is automatically checked before the account is created —
see "Automated teacher ID check" below. Email/password and verification are handled by
**Firebase Authentication**; the teacher ID document is stored in **Supabase** Storage
(the same project `fastapi-backend/` uses).

1. In the Firebase console for your project → **Authentication → Sign-in method** →
   enable the **Email/Password** provider.
2. Project Settings (gear icon) → **General** tab → copy the **Web API Key**.
3. Copy `backend/.env.example` to `backend/.env` and fill in `FIREBASE_API_KEY` with
   that value, plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings →
   API in the Supabase dashboard) for the teacher ID upload. The service role key is
   only used server-side — never expose it to the frontend.
4. In Supabase, under **Storage**, create a new bucket named `teacher-id-documents` and
   leave **"Public bucket" unchecked** — ID photos are sensitive and must stay private.
   No RLS policies are needed since the backend only ever accesses it with the service
   role key (which bypasses RLS).

Nothing else to configure — `localhost` is authorized in every Firebase project by
default, and Firebase's default verification email template needs no SMTP setup.

Without `backend/.env` filled in, the rest of the app (seed accounts, reels, map,
worksheets, craft, etc.) still runs with zero config as before — only signup fails,
with "We couldn't send the verification email" (students) or "We couldn't upload your
ID" (teachers).

**Teacher ID review:** a teacher's uploaded ID is stored privately in the
`teacher-id-documents` bucket (path shown in `users.id_document_path`) purely for you,
the app owner, to review manually from the Supabase dashboard if you want a second look
— there's no in-app admin/approval screen. A teacher account works normally (once their
email is verified) as long as it passed the automated check below.

**Automated teacher ID check:** signup runs the uploaded photo through local OCR
(`tesseract.js`, no external service, no account/cost) and rejects the signup outright
unless it can find the word "Qatar" on the card and a plausible date of birth showing
the person is 23 or older — the oldest date found on the card is treated as the date of
birth (a QID shows issue/expiry/DOB dates, and DOB is reliably the oldest of the three).
This is a **best-effort heuristic, not real document verification** — a blurry, rotated,
or low-light photo of a genuine, valid ID can be incorrectly rejected; ask the teacher to
retry with a clearer, well-lit photo of the whole card. Only JPG/PNG are accepted (no
PDF) since OCR needs a plain image. The first ID upload after a fresh install downloads
`tesseract.js`'s English OCR language data (a few MB, one-time, then cached).

### Dev utility: deleting a test account

While testing signup, `backend/scripts/delete-user.ts` fully removes one account by
email — the local DB row, its Supabase-stored ID document (if any), and the Firebase
Auth user — so the same username/email is free to sign up with again:

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

## Feature Map

| Page | What it does |
|---|---|
| `/login`, `/signup` | Authentication — signup picks an account type (student or teacher); students also enter their grade |
| `/` | News & announcements feed (filterable by subject) for students; teachers get a composer here instead to post announcements/study material |
| `/reels` | TikTok-style vertical swipe feed (student-only) — watch each lesson, take its quiz inline, feed grows as new levels unlock |
| `/map` | 50-level 2D adventure map (student-only) with 5 themed zones and boss fights every 10 levels |
| `/craft` | The Quarry — a Minecraft-style survival mini-game (student-only): dig, gather ores, manage food/HP, build, and craft tools/items |
| `/worksheets` | Generate easy/medium/hard practice worksheets per subject (student-only); XP scales with difficulty |
| `/leaderboard` | Monthly top-XP students (student-only), medals for top 3 |
| `/friends` | Search students, send/accept friend requests (student-only) |
| `/profile` | XP, level, stats, avatar & display name editing |

## Content

- **Map levels 1–10** (alternating Math/Science, culminating in the Level 10 boss "The Guardian of Al Zubarah") are fully authored: lesson scripts + 4 quiz questions each, all fact-checked for grade-5 accuracy.
- **Levels 11–50** exist as real map nodes across 4 themed zones (Souq Quarter, Corniche Coast, Sky Observatory, Falcon's Peak) but are marked "Coming Soon" — the schema and seed script (`backend/src/db/seed.ts`) are ready for that content to be added without any code changes.
- **Worksheet bank** is fully populated and NOT level-gated: 12 questions × 2 subjects × 3 difficulties = 72 questions, sampled 8 at a time per generated worksheet.
- Lesson "videos" are a real, ready-to-use `<video>` player wired to a `video_url` field. It's currently empty for every reel (shows a friendly "video coming soon" placeholder) to avoid hot-linking external clips — just set `video_url` in the database once real recorded lessons exist.

## Language / Arabic Support

- The whole app — every page, button, form, error, and every quiz/lesson/news content item — is available in both **Arabic (default, RTL)** and **English (LTR)**. Toggle any time with the 🌐 button in the nav bar (or top-right on the login/signup screens); the choice is remembered in `localStorage` and switches instantly with no page reload or refetch, since the API returns both language variants of every content field and the frontend picks the right one live.
- `frontend/src/lib/i18n.ts` holds the full UI-string dictionary (`en`/`ar`) plus a lookup table that translates the backend's (English) error messages for display.
- Educational content is bilingual at the database level: every translatable column has a `_ar` counterpart (e.g. `reels.script_text` / `reels.script_text_ar`) populated in `backend/src/db/seed.ts`. New content (levels 11–50) should be added with both languages from the start to keep this consistent.
- RTL layout is applied via `dir="rtl"` on `<html>`, which flips flexbox/text-alignment automatically; a few spots that needed explicit fixes (back-arrow direction, result-card accent borders) use CSS logical properties (`inset-inline-start`, `text-align: start`, etc.) so they mirror correctly in both directions.

## Security & Content Safety

- Real accounts' passwords are managed entirely by Firebase Authentication (never stored locally); the seeded demo accounts (which predate Firebase) still use a local bcrypt hash. Sessions are random tokens (only their hash is stored server-side, in a revocable `sessions` table) delivered via httpOnly, sameSite cookies.
- A custom-header check (`X-Requested-With`) is required on every mutating request as CSRF protection.
- Every API input is validated server-side with `zod`; all SQL is parameterized (no string-built queries).
- Rate limiting on login/signup.
- **Every username, display name, and teacher news post is run through a server-side moderation filter** (`backend/src/lib/moderation.ts`) before it's stored — never trust the client:
  - Normalizes leetspeak (`4→a`, `3→e`, `1→i`, `0→o`, `$→s`, …) and repeated letters, then checks against an English + Arabic profanity block list using whole-word matching (so words like "class" are never falsely flagged).
  - Also blocks text that looks like an attempt to share emails, phone numbers, or other-app handles ("add me on…", "my whatsapp is…").
  - Blocked content is rejected outright and never written to the database.
- Role-based access control: students and teachers each get their own API and UI surface — a teacher account gets a 403 from the API (not just a hidden nav item) if it somehow reaches a student-only route, and vice versa.

## Known Scope Limits (by design)

- Lesson videos are placeholders (see Content above).
- Map levels 11–50 are visible but not yet content-authored.
- This is a local development app; no production deployment/hosting configuration is included.

## Project Structure

```
backend/src/
  db/          schema.sql, db.ts (init + migrations), seed.ts (all content)
  lib/         moderation.ts, xp.ts, session.ts, schemas.ts
  middleware/  auth.ts (incl. requireRole), validate.ts, rateLimit.ts
  routes/      auth, users, reels, map, worksheets, leaderboard, friends, craft, news
  index.ts     Express app entry, student/teacher route gating

frontend/src/
  pages/       one file per route (incl. TeacherHomePage for the teacher role)
  components/  Sidebar, Topbar, Avatar, ReelSlide, QuizCard, QuizResults, BossArena,
               LevelUpToast, NewsCard, CraftMenu, AuthShell, LanguageToggle
  lib/         api.ts (fetch wrapper), auth-context.tsx, language-context.tsx,
               i18n.ts (dictionary + error translation), craftWorld/craftItems/
               craftEntities/craftTextures.ts (the Quarry mini-game)
  styles/      theme.css (design tokens, glassmorphism, RTL-aware)

fastapi-backend/   optional Python service — see "Getting Started" above
  main.py             FastAPI app + endpoints
  supabase_client.py  Supabase client setup
  reel_generator.py   MoviePy reel generation
```
