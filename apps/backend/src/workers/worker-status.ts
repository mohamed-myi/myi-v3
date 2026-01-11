// Worker status tracking for health checks.
// Each worker sets its status when starting/stopping.

let _syncWorkerRunning = false;
let _metadataWorkerRunning = false;
let _topStatsWorkerRunning = false;

// Sync Worker
export function setSyncWorkerRunning(running: boolean): void {
    _syncWorkerRunning = running;
}
export function isSyncWorkerRunning(): boolean {
    return _syncWorkerRunning;
}

// Metadata Worker
export function setMetadataWorkerRunning(running: boolean): void {
    _metadataWorkerRunning = running;
}
export function isMetadataWorkerRunning(): boolean {
    return _metadataWorkerRunning;
}

// Top Stats Worker
export function setTopStatsWorkerRunning(running: boolean): void {
    _topStatsWorkerRunning = running;
}
export function isTopStatsWorkerRunning(): boolean {
    return _topStatsWorkerRunning;
}

// Playlist Worker
let _playlistWorkerRunning = false;
export function setPlaylistWorkerRunning(running: boolean): void {
    _playlistWorkerRunning = running;
}
export function isPlaylistWorkerRunning(): boolean {
    return _playlistWorkerRunning;
}
