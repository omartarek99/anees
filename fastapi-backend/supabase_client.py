"""Supabase client factory.

Loads credentials from `.env` (see `.env.example` for the expected keys) and exposes two
clients:

- `supabase`       — uses the anon key, respects Row Level Security. Use this for anything
                      scoped to the requesting user.
- `supabase_admin` — uses the service role key, bypasses Row Level Security. Server-side only;
                      never expose this client or its key to the frontend. `None` if the
                      service role key isn't set (the anon client alone is enough to start).
"""

import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise RuntimeError(
        "Missing Supabase credentials. Copy fastapi-backend/.env.example to "
        "fastapi-backend/.env and fill in SUPABASE_URL and SUPABASE_ANON_KEY "
        "(SUPABASE_SERVICE_ROLE_KEY is optional but needed for admin-only operations)."
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

supabase_admin: Client | None = (
    create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) if SUPABASE_SERVICE_ROLE_KEY else None
)
