-- Anees database schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  -- Encrypted at rest (AES-256-GCM, see lib/encryption.ts) -- never queried directly.
  -- email_hash below is the deterministic lookup key uniqueness/matching actually use.
  email TEXT NOT NULL,
  email_hash TEXT,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_key TEXT NOT NULL DEFAULT 'falcon',
  total_xp INTEGER NOT NULL DEFAULT 0,
  -- Separate currency from total_xp, only ever earned by teacher accounts (worksheet
  -- prints + video uploads, see lib/xp.ts) -- drives the teacher-only leaderboard
  -- (routes/leaderboard.ts), kept apart from student XP since it rewards a completely
  -- different kind of activity and isn't meant to be comparable to it.
  teacher_points INTEGER NOT NULL DEFAULT 0,
  is_seed INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL CHECK (role IN ('student','teacher','admin')) DEFAULT 'student',
  grade INTEGER,
  email_verified INTEGER NOT NULL DEFAULT 0,
  id_document_path TEXT,
  firebase_uid TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  -- Admin-issued warning shown once to the account, then cleared when they dismiss it (or
  -- an admin clears it directly). NULL means no active warning.
  warning_message TEXT,
  warning_issued_at TEXT,
  -- Timed suspension, separate from is_active (which is a manual, indefinite toggle) --
  -- NULL or a past timestamp means not banned; a future timestamp blocks login/access
  -- until then and lifts itself automatically (checked live against datetime('now'), no
  -- background job needed).
  banned_until TEXT,
  -- Public "about me" text, shown on the profile page (own and others').
  bio TEXT NOT NULL DEFAULT '',
  -- Uploaded profile photo (Supabase Storage public URL), overriding the stylized
  -- avatar_key icon wherever an avatar is shown. NULL until the user uploads one.
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '📘'
);

CREATE TABLE IF NOT EXISTS news_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id),
  title TEXT NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  body_ar TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '📣',
  -- NULL for seeded/system announcements; set to the authoring teacher's user id for
  -- posts created through the teacher news composer.
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS map_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level_number INTEGER NOT NULL UNIQUE,
  subject_id INTEGER REFERENCES subjects(id),
  kind TEXT NOT NULL CHECK (kind IN ('normal','boss')),
  title TEXT NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '',
  xp_threshold INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready','coming_soon')) DEFAULT 'coming_soon'
);

CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  map_level_id INTEGER NOT NULL REFERENCES map_levels(id),
  title TEXT NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '',
  script_text TEXT NOT NULL,
  script_text_ar TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  duration_sec INTEGER NOT NULL DEFAULT 45,
  order_in_level INTEGER NOT NULL DEFAULT 1,
  -- NULL for seeded/AI-generated content; set to the authoring teacher's user id for
  -- reels created through the teacher reel composer.
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Set only for teacher-authored grade-based lessons (1-12), decoupled from the map
  -- level system -- when set, map_level_id/subject_id above are a harmless placeholder
  -- (see backend/src/routes/teacherReels.ts) never read for these rows; the student
  -- feed matches them by grade instead (backend/src/routes/reels.ts GET /grade).
  grade INTEGER
);

CREATE TABLE IF NOT EXISTS reel_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_text_ar TEXT NOT NULL DEFAULT '',
  choices_json TEXT NOT NULL,
  choices_json_ar TEXT NOT NULL DEFAULT '[]',
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  explanation_ar TEXT NOT NULL DEFAULT '',
  xp_value INTEGER NOT NULL DEFAULT 10,
  order_in_reel INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS boss_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_level_id INTEGER NOT NULL REFERENCES map_levels(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_text_ar TEXT NOT NULL DEFAULT '',
  choices_json TEXT NOT NULL,
  choices_json_ar TEXT NOT NULL DEFAULT '[]',
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  explanation_ar TEXT NOT NULL DEFAULT '',
  order_in_fight INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_level_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_level_id INTEGER NOT NULL REFERENCES map_levels(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('locked','available','completed')) DEFAULT 'locked',
  stars INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  UNIQUE(user_id, map_level_id)
);

CREATE TABLE IF NOT EXISTS worksheet_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  question_text TEXT NOT NULL,
  question_text_ar TEXT NOT NULL DEFAULT '',
  choices_json TEXT NOT NULL,
  choices_json_ar TEXT NOT NULL DEFAULT '[]',
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  explanation_ar TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS worksheet_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  difficulty TEXT NOT NULL,
  question_ids_json TEXT NOT NULL,
  answers_json TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('generated','submitted')) DEFAULT 'generated',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reel_watch_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  -- Genuine total seconds ever watched, across every watch-through (uncapped -- rewatching
  -- keeps adding, unlike the old one-time-per-duration cap). Purely a reporting metric now;
  -- points no longer scale off it directly (see loop_watched_seconds/current_loop_tier).
  watched_seconds REAL NOT NULL DEFAULT 0,
  -- Total watch POINTS ever awarded for this reel (VIDEO_HALF_WATCH_POINTS/
  -- VIDEO_FULL_WATCH_POINTS, lib/xp.ts) -- cumulative across every watch-through.
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  -- Progress within the CURRENT watch-through only (0..reel duration) -- rolls back to 0
  -- (minus overflow) once a full watch-through is credited, so the next loop/rewatch can
  -- earn points again. current_loop_tier is 1 once the half-watched point has already been
  -- paid for this specific watch-through (so it isn't paid again when the same
  -- watch-through goes on to finish), reset to 0 when the loop completes.
  loop_watched_seconds REAL NOT NULL DEFAULT 0,
  current_loop_tier INTEGER NOT NULL DEFAULT 0,
  -- Has this reel's quiz been submitted at least once (sticky) -- used for the admin
  -- "quizzes solved" stat, not for gating points (every submission pays points now).
  quiz_completed INTEGER NOT NULL DEFAULT 0,
  -- Has this reel's quiz ever been passed with a score >=50% -- map-level reels require
  -- this on EVERY reel belonging to a level before the next level unlocks (see
  -- routes/reels.ts POST /:reelId/submit). Sticky like quiz_completed: sticks once true.
  passed_quiz INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, reel_id)
);

-- One row per credited POST /:reelId/watch call, purely so the admin monthly watch-time
-- chart can sum real seconds-per-month directly -- reel_watch_progress only ever stores a
-- running total plus a single "last touched" timestamp, which can't say how much was
-- watched *in a given month*. Not used for point-awarding at all (that's
-- reel_watch_progress.loop_watched_seconds/current_loop_tier).
CREATE TABLE IF NOT EXISTS reel_watch_seconds_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seconds REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log for teacher_points awards (worksheet_print / video_upload), mirroring
-- xp_events -- also what the teacher leaderboard sums per month (routes/leaderboard.ts).
CREATE TABLE IF NOT EXISTS teacher_point_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per worksheet-print action a teacher takes (routes/worksheets.ts POST /print) --
-- both the "worksheets printed" profile stat and the print-points award read off this.
CREATE TABLE IF NOT EXISTS worksheet_prints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Certificates an admin hand-issues to a student or teacher (routes/admin.ts POST
-- /certificates) -- shown on the recipient's own profile (routes/users.ts
-- profileSummary), printable there the same way a teacher's worksheet is.
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_ar TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  message_ar TEXT NOT NULL DEFAULT '',
  issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined')) DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(from_user_id, to_user_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS craft_saves (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  seed INTEGER NOT NULL,
  world_diff_json TEXT NOT NULL DEFAULT '{}',
  inventory_json TEXT NOT NULL DEFAULT '{}',
  player_x REAL NOT NULL,
  player_y REAL NOT NULL,
  player_z REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  hp INTEGER NOT NULL DEFAULT 20,
  food INTEGER NOT NULL DEFAULT 20,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- First-party pageview analytics -- deliberately not a third-party script (Google
-- Analytics etc.): this is a children's platform, and sending student usage data to an
-- external tracker raises real privacy/COPPA-adjacent concerns for no benefit an
-- in-house count doesn't already cover. No user linkage on purpose (see routes/analytics.ts)
-- -- a path and a timestamp is enough to answer "what's used, when", nothing to consent-gate
-- beyond the existing cookie/privacy notice.
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_xp_events_user_time ON xp_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_progress_user ON user_level_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
