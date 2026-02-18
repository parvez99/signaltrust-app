ALTER TABLE trust_candidate_profiles ADD COLUMN doc_hash TEXT;
ALTER TABLE trust_candidate_profiles ADD COLUMN doc_hash_v TEXT;

CREATE INDEX IF NOT EXISTS idx_trust_profiles_candidate_dochash
  ON trust_candidate_profiles(created_by_candidate_id, doc_hash);

CREATE INDEX IF NOT EXISTS idx_trust_profiles_candidate_created
  ON trust_candidate_profiles(created_by_candidate_id, created_at);
