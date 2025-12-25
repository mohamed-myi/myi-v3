/*
  Warnings:

  - The `status` column on the `import_jobs` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `listening_events` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `source` column on the `listening_events` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `user_time_bucket_stats` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `audio_features` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `term` on the `spotify_top_artists` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `term` on the `spotify_top_tracks` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `bucket_type` on the `user_time_bucket_stats` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Source" AS ENUM ('API', 'IMPORT', 'BACKFILL');

-- CreateEnum
CREATE TYPE "Term" AS ENUM ('SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM');

-- CreateEnum
CREATE TYPE "BucketType" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- DropForeignKey
ALTER TABLE "audio_features" DROP CONSTRAINT "audio_features_track_id_fkey";

-- AlterTable
ALTER TABLE "import_jobs" DROP COLUMN "status",
ADD COLUMN     "status" "JobStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "listening_events" DROP CONSTRAINT "listening_events_pkey",
DROP COLUMN "source",
ADD COLUMN     "source" "Source" NOT NULL DEFAULT 'API',
ADD CONSTRAINT "listening_events_pkey" PRIMARY KEY ("id", "played_at");

-- AlterTable
ALTER TABLE "spotify_top_artists" DROP COLUMN "term",
ADD COLUMN     "term" "Term" NOT NULL;

-- AlterTable
ALTER TABLE "spotify_top_tracks" DROP COLUMN "term",
ADD COLUMN     "term" "Term" NOT NULL;

-- AlterTable
ALTER TABLE "user_time_bucket_stats" DROP CONSTRAINT "user_time_bucket_stats_pkey",
DROP COLUMN "bucket_type",
ADD COLUMN     "bucket_type" "BucketType" NOT NULL,
ADD CONSTRAINT "user_time_bucket_stats_pkey" PRIMARY KEY ("user_id", "bucket_type", "bucket_date");

-- DropTable
DROP TABLE "audio_features";

-- CreateIndex
CREATE INDEX "artists_genres_idx" ON "artists" USING GIN ("genres");

-- CreateIndex
CREATE INDEX "listening_events_track_id_idx" ON "listening_events"("track_id");

-- CreateIndex
CREATE INDEX "spotify_top_artists_artist_id_idx" ON "spotify_top_artists"("artist_id");

-- CreateIndex
CREATE UNIQUE INDEX "spotify_top_artists_user_id_term_rank_key" ON "spotify_top_artists"("user_id", "term", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "spotify_top_artists_user_id_term_artist_id_key" ON "spotify_top_artists"("user_id", "term", "artist_id");

-- CreateIndex
CREATE INDEX "spotify_top_tracks_track_id_idx" ON "spotify_top_tracks"("track_id");

-- CreateIndex
CREATE UNIQUE INDEX "spotify_top_tracks_user_id_term_rank_key" ON "spotify_top_tracks"("user_id", "term", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "spotify_top_tracks_user_id_term_track_id_key" ON "spotify_top_tracks"("user_id", "term", "track_id");

-- CreateIndex
CREATE INDEX "track_artists_artist_id_idx" ON "track_artists"("artist_id");

-- CreateIndex
CREATE INDEX "tracks_album_id_idx" ON "tracks"("album_id");

-- CreateIndex
CREATE INDEX "user_artist_stats_artist_id_idx" ON "user_artist_stats"("artist_id");

-- CreateIndex
CREATE INDEX "user_time_bucket_stats_user_id_bucket_type_bucket_date_idx" ON "user_time_bucket_stats"("user_id", "bucket_type", "bucket_date" DESC);

-- CreateIndex
CREATE INDEX "user_track_stats_track_id_idx" ON "user_track_stats"("track_id");
