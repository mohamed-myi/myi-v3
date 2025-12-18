-- CreateTable
CREATE TABLE "audio_features" (
    "track_id" TEXT NOT NULL,
    "acousticness" DOUBLE PRECISION NOT NULL,
    "danceability" DOUBLE PRECISION NOT NULL,
    "energy" DOUBLE PRECISION NOT NULL,
    "instrumentalness" DOUBLE PRECISION NOT NULL,
    "key" INTEGER NOT NULL,
    "liveness" DOUBLE PRECISION NOT NULL,
    "loudness" DOUBLE PRECISION NOT NULL,
    "mode" INTEGER NOT NULL,
    "speechiness" DOUBLE PRECISION NOT NULL,
    "tempo" DOUBLE PRECISION NOT NULL,
    "time_signature" INTEGER NOT NULL,
    "valence" DOUBLE PRECISION NOT NULL,
    "duration_ms" INTEGER NOT NULL,

    CONSTRAINT "audio_features_pkey" PRIMARY KEY ("track_id")
);

-- AddForeignKey
ALTER TABLE "audio_features" ADD CONSTRAINT "audio_features_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
