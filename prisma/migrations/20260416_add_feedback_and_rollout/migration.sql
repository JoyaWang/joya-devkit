-- AlterTable: add rollout_percent to app_releases
ALTER TABLE "app_releases" ADD COLUMN "rollout_percent" INTEGER NOT NULL DEFAULT 100;

-- CreateTable: feedback_submissions
CREATE TABLE "feedback_submissions" (
    "id" TEXT NOT NULL,
    "project_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "error_message" TEXT,
    "error_type" TEXT,
    "stack_trace" TEXT,
    "source" TEXT,
    "logs" TEXT,
    "device_info" TEXT,
    "user_id" TEXT,
    "username" TEXT,
    "current_route" TEXT,
    "app_version" TEXT,
    "build_number" TEXT,
    "github_issue_url" TEXT,
    "github_issue_number" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_submissions_project_key_type_created_at_idx" ON "feedback_submissions"("project_key", "type", "created_at");
CREATE INDEX "feedback_submissions_project_key_status_idx" ON "feedback_submissions"("project_key", "status");

-- CreateTable: feedback_client_settings
CREATE TABLE "feedback_client_settings" (
    "id" TEXT NOT NULL,
    "project_key" TEXT NOT NULL,
    "error_reporting_enabled" BOOLEAN NOT NULL DEFAULT true,
    "crash_reporting_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_client_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feedback_client_settings_project_key_key" ON "feedback_client_settings"("project_key");
