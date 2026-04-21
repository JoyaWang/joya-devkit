-- Migration: Add feedback issue group deduplication support
-- Created: 2026-04-21
-- Description:
--   - add feedback_submissions.issue_group_id for submission -> issue group linkage
--   - create feedback_issue_groups as deduplicated GitHub issue grouping truth source
--   - add required indexes for lookup and worker reuse

-- AlterTable: feedback_submissions
ALTER TABLE "feedback_submissions"
  ADD COLUMN IF NOT EXISTS "issue_group_id" TEXT;

-- Index: feedback_submissions.issue_group_id
CREATE INDEX IF NOT EXISTS "feedback_submissions_issue_group_id_idx"
  ON "feedback_submissions"("issue_group_id");

-- CreateTable: feedback_issue_groups
CREATE TABLE IF NOT EXISTS "feedback_issue_groups" (
  "id" TEXT NOT NULL,
  "project_key" TEXT NOT NULL,
  "runtime_env" TEXT NOT NULL,
  "normalized_fingerprint" TEXT NOT NULL,
  "normalized_summary" TEXT NOT NULL,
  "github_issue_number" INTEGER,
  "github_issue_url" TEXT,
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "first_occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "latest_submission_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feedback_issue_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feedback_issue_groups_project_key_runtime_env_normalized_fingerprint_key"
  ON "feedback_issue_groups"("project_key", "runtime_env", "normalized_fingerprint");

CREATE INDEX IF NOT EXISTS "feedback_issue_groups_project_key_status_idx"
  ON "feedback_issue_groups"("project_key", "status");
