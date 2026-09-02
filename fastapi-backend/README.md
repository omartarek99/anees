# Anees FastAPI backend

A FastAPI service using the Supabase Python client. Separate from `../backend` (the existing
Express/SQLite API) — this is its own service in the same repo.

## Setup

```bash
cd fastapi-backend
python -m venv .venv
.venv\Scripts\activate      # Windows (PowerShell: .venv\Scripts\Activate.ps1)
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your Supabase project's URL and keys
(Project Settings → API in the Supabase dashboard):

```bash
cp .env.example .env
```

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`.env` is git-ignored — never commit it.

## Run

```bash
uvicorn main:app --reload
```

- `GET /health` — liveness check, no Supabase call.
- `GET /health/supabase` — confirms the Supabase client can reach your project.
- `POST /reels/generate` — kicks off reel generation and returns `202 Accepted` immediately;
  see below.

## Reel generation

```bash
curl -X POST http://127.0.0.1:8000/reels/generate \
  -H "Content-Type: application/json" \
  -d '{"topic": "Fractions Basics", "difficulty_level": "medium"}'
```

Returns `202 Accepted` right away. Afterward, via `BackgroundTasks` (a few seconds, doesn't
block the event loop), `reel_generator.py`:

1. Renders a solid-color title card locally under `assets/` (color keyed off
   `difficulty_level`; `topic` as overlay text) — `assets/` is scratch space, git-ignored,
   created automatically.
2. Uploads the MP4 to the Supabase `videos` storage bucket (service role key).
3. Inserts a row into the `reels` table — `topic`, `difficulty_level` (stored as an integer:
   `easy`=1, `medium`=2, `hard`=3 — that's the live column's type, not text), `video_url` (the
   bucket's public CDN URL).
4. Deletes the local file — only after the upload + insert both succeed, so a failure partway
   through leaves the render on disk instead of silently losing it.

This is a basic placeholder video pipeline — solid title card, no narration/animation/multiple
scenes. The publish flow (storage + table) is the real thing.

## Client usage

`supabase_client.py` exposes two clients:

- `supabase` — anon key, respects Row Level Security. Use for anything scoped to the
  requesting user.
- `supabase_admin` — service role key, bypasses Row Level Security. Server-side only; never
  send this client's data to the frontend. `None` if `SUPABASE_SERVICE_ROLE_KEY` isn't set.
