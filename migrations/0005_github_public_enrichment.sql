-- 0005_github_public_enrichment.sql
-- Public GitHub enrichment cache (per trust profile)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trust_github_public_enrichment (
  trust_profile_id TEXT PRIMARY KEY,
  github_login TEXT NOT NULL,
  account_created_at TEXT,
  public_repos INTEGER,
  followers INTEGER,
  top_languages_json TEXT,
  keyword_hits_json TEXT,
  last_activity_at TEXT,
  activity_score INTEGER,
  raw_json TEXT,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (trust_profile_id) REFERENCES trust_candidate_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_trust_github_public_enrichment_login
  ON trust_github_public_enrichment(github_login);