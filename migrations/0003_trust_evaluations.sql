-- 0003_trust_evaluations.sql
-- Persist LLM-normalized profile + deterministic profile + evaluation metadata
-- D1/SQLite-friendly (TEXT + JSON as TEXT)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trust_evaluations (
  id TEXT PRIMARY KEY,
  trust_profile_id TEXT NOT NULL,
  trust_report_id TEXT, -- nullable (in case eval fails before report insert)

  engine_version TEXT NOT NULL,
  signals_version TEXT,
  profile_schema_version TEXT,
  prompt_version TEXT,
  model TEXT,

  extraction_source TEXT NOT NULL, -- "llm" | "fallback"
  extraction_error TEXT,           -- error string if fallback used

  llm_meta_json TEXT,              -- { usage, latencyMs, extractionConfidence, modelUsed }
  llm_normalized_json TEXT,        -- full NormalizedProfile from LLM schema
  deterministic_profile_json TEXT, -- your legacy normalized profile used for signals

  created_at TEXT NOT NULL,

  FOREIGN KEY(trust_profile_id) REFERENCES trust_candidate_profiles(id),
  FOREIGN KEY(trust_report_id) REFERENCES trust_reports(id)
);

CREATE INDEX IF NOT EXISTS idx_trust_evals_profile_created
  ON trust_evaluations(trust_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trust_evals_report
  ON trust_evaluations(trust_report_id);