-- Fix Partitioning Migration
-- This migration drops the non-partitioned listening_events table and recreates it as partitioned.
-- Only creates: legacy, Dec 2025, Jan 2026 partitions.
-- Future partitions are created on-demand by ensurePartitionForDate() in the application code.

-- Drop the existing non-partitioned table
DROP TABLE IF EXISTS "listening_events" CASCADE;

-- Create the partitioned table
CREATE TABLE "listening_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "played_at" TIMESTAMPTZ(3) NOT NULL,
    "ms_played" INTEGER NOT NULL,
    "is_estimated" BOOLEAN NOT NULL DEFAULT true,
    "is_skip" BOOLEAN NOT NULL DEFAULT false,
    "source" "Source" NOT NULL DEFAULT 'API',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listening_events_pkey" PRIMARY KEY ("id", "played_at")
) PARTITION BY RANGE ("played_at");

-- Create Legacy Partition (for data before Dec 25, 2020)
CREATE TABLE "listening_events_legacy" PARTITION OF "listening_events"
    FOR VALUES FROM (MINVALUE) TO ('2020-12-25 00:00:00+00');

-- Create Dec 2025 and Jan 2026 partitions (current month + last month)
CREATE TABLE "listening_events_y2025m12" PARTITION OF "listening_events"
    FOR VALUES FROM ('2025-12-01 00:00:00+00') TO ('2026-01-01 00:00:00+00');

CREATE TABLE "listening_events_y2026m01" PARTITION OF "listening_events"
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

-- Recreate Indexes on parent table (inherited by partitions)
CREATE INDEX "listening_events_user_id_played_at_idx" ON "listening_events"("user_id", "played_at" DESC);
CREATE INDEX "listening_events_user_id_created_at_idx" ON "listening_events"("user_id", "created_at" DESC);
CREATE INDEX "listening_events_track_id_idx" ON "listening_events"("track_id");
CREATE UNIQUE INDEX "listening_events_user_id_track_id_played_at_key" ON "listening_events"("user_id", "track_id", "played_at");

-- Recreate Foreign Keys
ALTER TABLE "listening_events" ADD CONSTRAINT "listening_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listening_events" ADD CONSTRAINT "listening_events_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Future partitions (e.g., 2026-02, or historical months like 2021-2025) are created
-- automatically by ensurePartitionForDate() in apps/backend/src/lib/partitions.ts
-- when data is ingested via sync-worker, import-worker, or any other entry point.
