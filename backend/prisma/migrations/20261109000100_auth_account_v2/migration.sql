-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "legacy_auth_exempt" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'ar',
ALTER COLUMN "password_hash" DROP NOT NULL;

-- Preserve existing access without asserting ownership of legacy email addresses.
-- Every account created after this migration requires the new verification rules.
ALTER TABLE "users" ALTER COLUMN "legacy_auth_exempt" SET DEFAULT false;

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "resend_after" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "specialist_applications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "specialization" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "summary" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "document_key" TEXT,
    "document_sha256" TEXT,
    "document_size" INTEGER,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specialist_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialist_reviews" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "decision" "ReviewDecision" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialist_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_deliveries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "MailStatus" NOT NULL DEFAULT 'PENDING',
    "attempted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_subject_key" ON "auth_identities"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_user_id_provider_key" ON "auth_identities"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_token_hash_key" ON "email_verifications"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "specialist_applications_user_id_key" ON "specialist_applications"("user_id");

-- CreateIndex
CREATE INDEX "specialist_applications_status_submitted_at_idx" ON "specialist_applications"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "specialist_reviews_application_id_created_at_idx" ON "specialist_reviews"("application_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mail_deliveries_event_key_key" ON "mail_deliveries"("event_key");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialist_applications" ADD CONSTRAINT "specialist_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialist_reviews" ADD CONSTRAINT "specialist_reviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "specialist_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialist_reviews" ADD CONSTRAINT "specialist_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_deliveries" ADD CONSTRAINT "mail_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
