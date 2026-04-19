-- Keep legacy feedback client settings table during transition.
-- New routes prefer feedback_project_configs, and still can fall back to
-- feedback_client_settings when old rows remain but no new config exists.

-- AlterTable: feedback_submissions
ALTER TABLE "feedback_submissions"
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "title" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "attachments_json" TEXT,
  ADD COLUMN "metadata_json" TEXT,
  ADD COLUMN "github_sync_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "github_sync_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "github_sync_error" TEXT,
  ADD COLUMN "github_sync_requested_at" TIMESTAMP(3),
  ADD COLUMN "github_synced_at" TIMESTAMP(3),
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable: feedback_project_configs
CREATE TABLE "feedback_project_configs" (
  "id" TEXT NOT NULL,
  "project_key" TEXT NOT NULL,
  "github_repo_owner" TEXT,
  "github_repo_name" TEXT,
  "github_token" TEXT,
  "github_issue_sync_enabled" BOOLEAN NOT NULL DEFAULT false,
  "manual_feedback_enabled" BOOLEAN NOT NULL DEFAULT true,
  "error_reporting_enabled" BOOLEAN NOT NULL DEFAULT true,
  "crash_reporting_enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feedback_project_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feedback_project_configs_project_key_key" ON "feedback_project_configs"("project_key");

-- CreateTable: feedback_issue_outbox
CREATE TABLE "feedback_issue_outbox" (
  "id" TEXT NOT NULL,
  "submission_id" TEXT NOT NULL,
  "project_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feedback_issue_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedback_submissions_project_key_github_sync_status_created_at_idx" ON "feedback_submissions"("project_key", "github_sync_status", "created_at");
CREATE INDEX "feedback_issue_outbox_project_key_status_next_retry_at_idx" ON "feedback_issue_outbox"("project_key", "status", "next_retry_at");
CREATE INDEX "feedback_issue_outbox_submission_id_idx" ON "feedback_issue_outbox"("submission_id");
