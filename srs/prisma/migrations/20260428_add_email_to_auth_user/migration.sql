-- AlterTable: make phone nullable and add email to auth_users
ALTER TABLE "auth_users" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "auth_users" ADD COLUMN "email" TEXT;

-- CreateIndex: unique constraint on project_key + email
CREATE UNIQUE INDEX "auth_users_project_key_email_key" ON "auth_users"("project_key", "email");
