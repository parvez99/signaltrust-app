-- 1) Ensure doc_hash exists (already does) and prevent NULL going forward
-- SQLite doesn't let you easily ALTER to NOT NULL; use an index + app guard.
-- Still: Create index that only applies when doc_hash IS NOT NULL.

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_candidate_dochash
ON trust_candidate_profiles(created_by_candidate_id, doc_hash);