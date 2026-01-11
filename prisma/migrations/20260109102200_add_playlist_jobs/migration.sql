-- CreateEnum (only if not exists)
DO $$ BEGIN
    CREATE TYPE "PlaylistCreationMethod" AS ENUM ('SHUFFLE', 'TOP_50_SHORT', 'TOP_50_MEDIUM', 'TOP_50_LONG', 'TOP_50_ALL_TIME', 'TOP_K_RECENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum (only if not exists)
DO $$ BEGIN
    CREATE TYPE "PlaylistJobStatus" AS ENUM ('PENDING', 'CREATING', 'ADDING_TRACKS', 'UPLOADING_IMAGE', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable (only if not exists)
CREATE TABLE IF NOT EXISTS "playlist_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "creation_method" "PlaylistCreationMethod" NOT NULL,
    "status" "PlaylistJobStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "cover_image_base64" TEXT,
    "source_playlist_id" TEXT,
    "k_value" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "total_tracks" INTEGER NOT NULL DEFAULT 0,
    "added_tracks" INTEGER NOT NULL DEFAULT 0,
    "estimated_tracks" INTEGER,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "rate_limit_delays" INTEGER NOT NULL DEFAULT 0,
    "last_heartbeat_at" TIMESTAMP(3),
    "processing_time_ms" INTEGER,
    "spotify_playlist_id" TEXT,
    "spotify_playlist_url" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (only if not exists)
CREATE INDEX IF NOT EXISTS "playlist_jobs_user_id_created_at_idx" ON "playlist_jobs"("user_id", "created_at" DESC);

-- AddForeignKey (only if not exists)
DO $$ BEGIN
    ALTER TABLE "playlist_jobs" ADD CONSTRAINT "playlist_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
