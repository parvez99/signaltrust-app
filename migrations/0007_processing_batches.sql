CREATE TABLE IF NOT EXISTS processing_batches (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  total_resumes INTEGER NOT NULL,
  processed_resumes INTEGER DEFAULT 0,
  failed_resumes INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES jobs(id)
);

CREATE INDEX IF NOT EXISTS idx_processing_batches_job
ON processing_batches(job_id);