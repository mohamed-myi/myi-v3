// Worker status tracking for health checks.
// Each worker sets its status when starting/stopping.

let _syncWorkerRunning = false;
let _audioFeaturesWorkerRunning = false;
let _metadataWorkerRunning = false;
let _topStatsWorkerRunning = false;

// Sync Worker
export function setSyncWorkerRunning(running: boolean): void {
    _syncWorkerRunning = running;
}
export function isSyncWorkerRunning(): boolean {
    return _syncWorkerRunning;
}

// Audio Features Worker
export function setAudioFeaturesWorkerRunning(running: boolean): void {
    _audioFeaturesWorkerRunning = running;
}
export function isAudioFeaturesWorkerRunning(): boolean {
    return _audioFeaturesWorkerRunning;
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
