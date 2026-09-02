# Anees 🦅

A Qatari-themed Math & Science learning platform for 5th-grade students. Students watch short lesson "reels" in a TikTok-style vertical swipe feed, answer quizzes to earn XP, climb a 50-level 2D adventure map, defeat Guardian bosses every 5 levels, generate difficulty-tiered practice worksheets, add friends, and message each other in a moderated, kid-safe chat. Fully bilingual (Arabic/English) with right-to-left layout.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite, React Router, Framer Motion
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite via Node's built-in `node:sqlite` module (no native compilation, no external DB server needed)
- **Auth**: httpOnly session cookies, `bcryptjs` password hashing

No external network calls happen at runtime (including "video" content — see Scope below), so the app works fully offline once dependencies are installed.

## Getting Started

Requires Node.js 22.5+ (built-in `node:sqlite` support). Tested on Node 24.

```bash
npm run install:all
npm run dev
```

This installs both the `backend/` and `frontend/` workspaces and starts:
- Backend API on **http://localhost:4000** (auto-creates and seeds `backend/data/app.db` on first run)
- Frontend on **http://localhost:5173** (Vite dev server, proxies `/api` to the backend)

Open **http://localhost:5173** and sign up a new student account to start playing. A handful of demo/seed students (Rashid, Khalid, Hamad, Abdulaziz, Nasser, Jassim) are pre-loaded so the Leaderboard and Friends features have something to show immediately — see "Seed data" below.

To reset all data (accounts, progress, messages), stop the servers and delete `backend/data/`; it will reseed automatically on the next `npm run dev`.

## Feature Map

| Page | What it does |
|---|---|
| `/login`, `/signup` | Student authentication |
| `/` | News & announcements homepage, filterable by subject |
| `/reels` | TikTok-style vertical scroll feed — swipe/scroll through lessons, take each quiz inline, feed grows as new levels unlock |
| `/map` | 50-level 2D adventure map with 5 themed zones and boss fights every 10 levels |
| `/worksheets` | Generate easy/medium/hard practice worksheets per subject; XP scales with difficulty |
| `/leaderboard` | Monthly top-XP students, medals for top 3 |
| `/friends` | Search students, send/accept friend requests |
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
- Rate limiting on login/signup and on sending messages.
- **Every chat message, username, and display name is run through a server-side moderation filter** (`backend/src/lib/moderation.ts`) before it's stored — never trust the client:
  - Normalizes leetspeak (`4→a`, `3→e`, `1→i`, `0→o`, `$→s`, …) and repeated letters, then checks against an English + Arabic profanity block list using whole-word matching (so words like "class" are never falsely flagged).
  - Also blocks messages that look like attempts to share emails, phone numbers, or other-app handles ("add me on…", "my whatsapp is…") — keeping contact inside the platform.
  - Blocked content is rejected outright and never written to the database.
- Messaging is only possible between confirmed friends (checked server-side on every request, not just in the UI).

## Known Scope Limits (by design)

- Lesson videos are placeholders (see Content above).
- Map levels 11–50 are visible but not yet content-authored.
- Messaging uses polling (~4s) rather than WebSockets — simpler and reliable at this scale.
- This is a local development app; no production deployment/hosting configuration is included.

## Project Structure

```
backend/src/
  db/          schema.sql, db.ts (init), seed.ts (all content)
  lib/         moderation.ts, xp.ts, session.ts, schemas.ts
  middleware/  auth.ts, validate.ts, rateLimit.ts
  routes/      auth, users, reels, map, worksheets, leaderboard, friends, messages, news
  index.ts     Express app entry

frontend/src/
  pages/       one file per route
  components/  NavBar, Avatar, ReelSlide, QuizCard, QuizResults, BossFightModal, LevelUpToast, NewsCard, AuthShell, LanguageToggle
  lib/         api.ts (fetch wrapper), auth-context.tsx, language-context.tsx, i18n.ts (dictionary + error translation)
  styles/      theme.css (Qatari design tokens: maroon/gold/sand palette, geometric pattern, RTL-aware)
```
