ALTER TABLE "app_releases"
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'official';

CREATE INDEX "app_releases_project_key_env_platform_channel_created_at_idx"
ON "app_releases" ("project_key", "env", "platform", "channel", "created_at" DESC);
