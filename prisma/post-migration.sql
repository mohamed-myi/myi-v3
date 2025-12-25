DROP TABLE IF EXISTS "listening_events";

CREATE TABLE "listening_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "track_id" TEXT NOT NULL,
  "played_at" TIMESTAMPTZ NOT NULL,
  "ms_played" INTEGER NOT NULL,
  "is_estimated" BOOLEAN NOT NULL DEFAULT true,
  "is_skip" BOOLEAN NOT NULL DEFAULT false,
  "source" "Source" NOT NULL DEFAULT 'API',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "listening_events_pkey" PRIMARY KEY ("id", "played_at"),
  CONSTRAINT "listening_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "listening_events_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
) PARTITION BY RANGE ("played_at");

CREATE UNIQUE INDEX "listening_events_user_id_track_id_played_at_key" ON "listening_events"("user_id", "track_id", "played_at");
CREATE INDEX "listening_events_user_id_played_at_idx" ON "listening_events"("user_id", "played_at" DESC);
CREATE INDEX "listening_events_user_id_created_at_idx" ON "listening_events"("user_id", "created_at" DESC);
CREATE INDEX "listening_events_track_id_idx" ON "listening_events"("track_id");

-- Initial Partitions : Dec 2025 and Jan 2026 
CREATE TABLE "listening_events_y2025m12" PARTITION OF "listening_events"
    FOR VALUES FROM ('2025-12-01 00:00:00+00') TO ('2026-01-01 00:00:00+00');

CREATE TABLE "listening_events_y2026m01" PARTITION OF "listening_events"
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

-- ms_played must be positive
ALTER TABLE "listening_events" ADD CONSTRAINT "chk_ms_played_positive" CHECK (ms_played > 0);

-- Autovacuum Tuning
ALTER TABLE "listening_events_y2025m12" SET (autovacuum_vacuum_scale_factor = 0.01);
ALTER TABLE "listening_events_y2026m01" SET (autovacuum_vacuum_scale_factor = 0.01);

-- Fillfactor Optimization
ALTER TABLE "listening_events_y2025m12" SET (fillfactor = 90);
ALTER TABLE "listening_events_y2026m01" SET (fillfactor = 90);

-- Statistics Target
ALTER TABLE "listening_events" ALTER COLUMN "user_id" SET STATISTICS 500;
ALTER TABLE "listening_events" ALTER COLUMN "played_at" SET STATISTICS 500;

