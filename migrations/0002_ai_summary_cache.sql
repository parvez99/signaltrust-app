CREATE TABLE IF NOT EXISTS trust_ai_summaries (
  id TEXT PRIMARY KEY,
  trust_report_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_report
ON trust_ai_summaries(trust_report_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_summaries_report_model_hash
ON trust_ai_summaries(trust_report_id, model, prompt_hash);