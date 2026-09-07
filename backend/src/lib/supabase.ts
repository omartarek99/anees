import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Only the teacher ID upload needs Supabase now (auth/email verification moved to
// Firebase, see lib/firebase.ts) — the rest of the app must keep working with zero
// config, so we don't throw at import time here. Routes that need it check
// `supabaseAdmin` for null instead.
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[supabase] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set (see backend/.env.example) -- ' +
      'teacher ID upload is disabled until backend/.env is filled in.'
  );
}

// Admin (service-role) client — bypasses Row Level Security. Server-side only, never
// expose this key or client to the frontend. Used solely to upload teacher ID documents
// to a private Storage bucket during signup.
export const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
