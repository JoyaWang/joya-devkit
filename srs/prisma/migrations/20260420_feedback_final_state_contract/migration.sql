ALTER TABLE "feedback_submissions"
  ADD COLUMN IF NOT EXISTS "fixed_in_version" TEXT,
  ADD COLUMN IF NOT EXISTS "fixed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fix_verified" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "verification_feedback" TEXT,
  ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status_history_json" TEXT;
