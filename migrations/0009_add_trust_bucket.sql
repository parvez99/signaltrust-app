-- Add missing columns required by queue worker
ALTER TABLE trust_reports ADD COLUMN trust_bucket TEXT;