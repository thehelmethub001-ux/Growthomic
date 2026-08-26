-- Migration: add 'notes' column to follow_up_jobs for skip-reason auditing
-- Used by followup-handler to record WHY a job was skipped (staleness guards)

ALTER TABLE follow_up_jobs
  ADD COLUMN IF NOT EXISTS notes TEXT;
