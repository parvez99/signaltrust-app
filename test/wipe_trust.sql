-- wipe_trust.sql (SAFE for D1)
PRAGMA foreign_keys=OFF;

-- Delete children first (order matters)
DELETE FROM trust_signal_events;
DELETE FROM trust_candidate_profiles;
DELETE FROM trust_candidates;

-- If you have any other trust_* tables, delete them before parents.
-- Example:
-- DELETE FROM trust_github_public_enrichment;

PRAGMA foreign_keys=ON;