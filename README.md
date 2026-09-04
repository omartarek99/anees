# Anees 🦅

A Qatari-themed Math & Science learning platform for 5th-grade students. Students watch short lesson "reels" in a TikTok-style vertical swipe feed, answer quizzes to earn XP, climb a 50-level 2D adventure map, defeat Guardian bosses every 5 levels, generate difficulty-tiered practice worksheets, add friends, and dig/build/craft in a Minecraft-style survival mini-game (the Quarry). Teachers get a separate account type to post announcements/study material to the student news feed. Fully bilingual (Arabic/English) with right-to-left layout.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite, React Router, Swiper (reels feed), Framer Motion + anime.js (UI animation), Three.js (the Quarry mini-game)
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite via Node's built-in `node:sqlite` module (no native compilation, no external DB server needed)
- **Auth**: httpOnly session cookies, `bcryptjs` password hashing
- **`fastapi-backend/`**: a separate, optional Python (FastAPI + Supabase) service — see its own section below. Not required to run the main app.

No external network calls happen at runtime for the main app (including "video" content — see Scope below), so it works fully offline once dependencies are installed.

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
- Frontend on **http://localhost:5173** (Vite dev server, proxies `/api` to the backend)

Open **http://localhost:5173**.

> **Note:** `frontend/src/lib/dev-config.ts` has `DEV_BYPASS_LOGIN = true` by default, so a fresh run **skips the login screen** and auto-signs-in as the seeded `dev_student` account. Set it to `false` (or delete its usage in `auth-context.tsx`) to see the real login/signup flow instead.

### Seed accounts

A student and a teacher account are always seeded, so both account types are testable immediately:

| Username | Password | Role |
|---|---|---|
| `dev_student` | `devpass123` | Student |
| `dev_teacher` | `teachpass123` | Teacher |

A handful of demo students (Rashid, Khalid, Hamad, Abdulaziz, Nasser, Jassim) are also pre-loaded so the Leaderboard and Friends features have something to show immediately.

To reset all data (accounts, progress, everything), stop the servers and delete `backend/data/`; it reseeds automatically on the next `npm run dev`.

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

- Passwords hashed with bcrypt; sessions are random tokens (only their hash is stored server-side, in a revocable `sessions` table) delivered via httpOnly, sameSite cookies.
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
