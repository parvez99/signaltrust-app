-- 0001_baseline_schema.sql
-- Baseline schema for local D1 to match remote.
-- NOTE: Do NOT include _cf_KV or d1_migrations (managed by Cloudflare/Wrangler).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  email TEXT,
  github_id TEXT UNIQUE,
  github_username TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  google_id TEXT,
  google_email TEXT,
  google_name TEXT
);

CREATE TABLE IF NOT EXISTS candidate_profiles (
  candidate_id TEXT PRIMARY KEY,
  role TEXT,
  target_country TEXT,
  current_location TEXT,
  visa_status TEXT,
  needs_sponsorship INTEGER,
  profile_completeness INTEGER,
  is_searchable INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  search_text TEXT,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS candidate_roles (
  candidate_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (candidate_id, role),
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS intro_requests (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  recruiter_email TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  role TEXT,
  target_country TEXT,
  email_domain TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_candidate_profiles (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  created_by_candidate_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_filename TEXT,
  source_text TEXT,
  normalized_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  extractor TEXT
);

CREATE TABLE IF NOT EXISTS trust_reports (
  id TEXT PRIMARY KEY,
  trust_profile_id TEXT NOT NULL,
  trust_score INTEGER NOT NULL,
  bucket TEXT NOT NULL,
  hard_triggered INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (trust_profile_id) REFERENCES trust_candidate_profiles(id)
);

CREATE TABLE IF NOT EXISTS trust_signals (
  id TEXT PRIMARY KEY,
  trust_report_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  category TEXT NOT NULL,
  severity_tier TEXT NOT NULL,
  confidence TEXT NOT NULL,
  deduction INTEGER NOT NULL,
  hard_trigger INTEGER NOT NULL,
  status TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  explanation TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (trust_report_id) REFERENCES trust_reports(id)
);

CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  target_country TEXT NOT NULL,
  current_location TEXT,
  created_at TEXT NOT NULL
);
