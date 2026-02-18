CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  target_country TEXT NOT NULL,
  current_location TEXT,
  created_at TEXT NOT NULL
);

