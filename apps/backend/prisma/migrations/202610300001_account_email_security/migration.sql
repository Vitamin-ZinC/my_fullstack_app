-- Stop rather than merge accounts or discard user progress when legacy duplicates exist.
DO $$ BEGIN
  IF EXISTS (SELECT lower(btrim("email")) FROM "User" GROUP BY lower(btrim("email")) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve duplicate normalized User emails before applying this migration';
  END IF;
END $$;
UPDATE "User" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));
CREATE UNIQUE INDEX "User_email_normalized_key" ON "User" (lower(btrim("email")));
ALTER TABLE "User" ADD COLUMN "welcomeEmailPendingAt" TIMESTAMP(3), ADD COLUMN "welcomeEmailSentAt" TIMESTAMP(3);
ALTER TYPE "AuthTokenPurpose" ADD VALUE IF NOT EXISTS 'EMAIL_VERIFY';
ALTER TYPE "AuthTokenPurpose" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
