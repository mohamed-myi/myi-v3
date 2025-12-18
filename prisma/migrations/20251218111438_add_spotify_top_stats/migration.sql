-- CreateTable
CREATE TABLE "spotify_top_tracks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spotify_top_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spotify_top_artists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "artist_id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spotify_top_artists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spotify_top_tracks_user_id_term_rank_key" ON "spotify_top_tracks"("user_id", "term", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "spotify_top_tracks_user_id_term_track_id_key" ON "spotify_top_tracks"("user_id", "term", "track_id");

-- CreateIndex
CREATE UNIQUE INDEX "spotify_top_artists_user_id_term_rank_key" ON "spotify_top_artists"("user_id", "term", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "spotify_top_artists_user_id_term_artist_id_key" ON "spotify_top_artists"("user_id", "term", "artist_id");

-- AddForeignKey
ALTER TABLE "spotify_top_tracks" ADD CONSTRAINT "spotify_top_tracks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotify_top_tracks" ADD CONSTRAINT "spotify_top_tracks_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotify_top_artists" ADD CONSTRAINT "spotify_top_artists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotify_top_artists" ADD CONSTRAINT "spotify_top_artists_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
