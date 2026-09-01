-- Anees database schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_key TEXT NOT NULL DEFAULT 'falcon',
  total_xp INTEGER NOT NULL DEFAULT 0,
  is_seed INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL CHECK (role IN ('student','teacher')) DEFAULT 'student',
  grade INTEGER,
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
  order_in_level INTEGER NOT NULL DEFAULT 1
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
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, reel_id)
);

CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS craft_saves (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  seed INTEGER NOT NULL,
  world_diff_json TEXT NOT NULL DEFAULT '{}',
  inventory_json TEXT NOT NULL DEFAULT '{}',
  player_x REAL NOT NULL,
  player_y REAL NOT NULL,
  player_z REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user_time ON xp_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(from_user_id, to_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_progress_user ON user_level_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
