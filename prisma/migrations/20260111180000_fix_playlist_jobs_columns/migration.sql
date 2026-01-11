-- Align playlist_jobs table with prisma/schema.prisma.
-- This fixes production 500s caused by missing columns written by the API.

-- CreateEnum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "ShuffleMode" AS ENUM ('TRULY_RANDOM', 'LESS_REPETITION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add missing columns (idempotency + shuffle mode)
ALTER TABLE "playlist_jobs"
    ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;

ALTER TABLE "playlist_jobs"
    ADD COLUMN IF NOT EXISTS "shuffle_mode" "ShuffleMode";

-- Enforce idempotency key uniqueness when present
CREATE UNIQUE INDEX IF NOT EXISTS "playlist_jobs_idempotency_key_key"
    ON "playlist_jobs"("idempotency_key");

