CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  source TEXT DEFAULT 'manual',
  job_url TEXT,
  created_at TEXT NOT NULL
);