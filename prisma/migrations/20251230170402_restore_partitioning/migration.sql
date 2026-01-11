-- Safe Idempotent Migration for Partitioning

-- 1. Create the main partitioned table if it doesn't exist
CREATE TABLE IF NOT EXISTS "listening_events" (
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

-- 2. Create Initial Partitions safely
CREATE TABLE IF NOT EXISTS "listening_events_y2025m12" PARTITION OF "listening_events"
    FOR VALUES FROM ('2025-12-01 00:00:00+00') TO ('2026-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "listening_events_y2026m01" PARTITION OF "listening_events"
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "listening_events_legacy" PARTITION OF "listening_events"
    FOR VALUES FROM (MINVALUE) TO ('2020-12-25 00:00:00+00');

-- 3. Restore Indexes safely
CREATE INDEX IF NOT EXISTS "listening_events_user_id_played_at_idx" ON "listening_events"("user_id", "played_at" DESC);
CREATE INDEX IF NOT EXISTS "listening_events_user_id_created_at_idx" ON "listening_events"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "listening_events_track_id_idx" ON "listening_events"("track_id");

-- Note: Unique index including partition key
CREATE UNIQUE INDEX IF NOT EXISTS "listening_events_user_id_track_id_played_at_key" ON "listening_events"("user_id", "track_id", "played_at");

-- 4. Restore Constraints safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listening_events_user_id_fkey') THEN
        ALTER TABLE "listening_events" ADD CONSTRAINT "listening_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listening_events_track_id_fkey') THEN
        ALTER TABLE "listening_events" ADD CONSTRAINT "listening_events_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;