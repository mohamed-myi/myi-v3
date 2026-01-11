export const UI = {
    PLAYLIST: {
        SHUFFLE: {
            TITLE: "Randomize Playlist",
            SUBTITLE: "Randomize your Playlist",
            DESCRIPTION: "Create a new playlist by shuffling tracks from an existing one. Choose between pure randomization or randomness with a guaranteed spacing between songs by the same artist.",
            MODES: {
                RANDOM: {
                    LABEL: "Truly Random",
                    DESCRIPTION: "Good ole fashioned Fisher-Yates algorithm, no guarantees."
                },
                SMART: {
                    LABEL: "Reduced Repeats",
                    DESCRIPTION: "Same deal but you'll never hear the same artist twice."
                }
            },
            INPUT: {
                SELECT_SOURCE_LABEL: "Select Source Playlist",
                SHUFFLE_MODE_LABEL: "Shuffle Mode"
            }
        },
        RECENT: {
            TITLE: "Recent History",
            SUBTITLE: "History Capture",
            DESCRIPTION: "Create a flashback playlist from your Spotify history. Capture your listening sessions from a specific time period or grab your most recent plays.",
            INPUT: {
                TRACK_COUNT_LABEL: "Number of Tracks",
                DATE_RANGE_LABEL: "Date Range",
                DATE_FROM_LABEL: "From",
                DATE_TO_LABEL: "To",
                DATE_HELPER: "Leave empty to use your most recent listening history."
            }
        },
        TOP_STATS: {
            TITLE: "Top 50 Stats",
            SUBTITLE: "Top Tracks",
            DESCRIPTION: "Generate a playlist of your top 50 most played tracks from Spotify. Choose from different time ranges to capture your listening habits over weeks, months, or all time.",
            INPUT: {
                SELECT_RANGE_LABEL: "Select Time Range"
            },
            RANGES: {
                SHORT: "Last 4 Weeks",
                MEDIUM: "Last 6 Months",
                LONG: "Last Year",
                ALL_TIME: "All Time"
            }
        },
        COMMON: {
            LABELS: {
                PLAYLIST_NAME: "Playlist Name",
                NEW_PLAYLIST_NAME: "New Playlist Name",
                COVER_IMAGE: "Cover Image",
                OPTIONAL_HINT: "(optional)",
                UPLOAD_BUTTON: "Upload",
                UPLOAD_COVER_BUTTON: "Upload cover image",
                IMAGE_REQUIREMENTS: "JPEG or PNG, max 256KB",
                ORIGINAL: "Original"
            },
            ACTIONS: {
                CANCEL: "Cancel",
                BACK: "Back",
                CONTINUE: "Continue",
                DONE: "Done",
                CREATE: "Create Playlist"
            },
            STATUS: {
                VALIDATING: {
                    SHUFFLE: "Checking playlist tracks...",
                    RECENT: "Scanning history...",
                    STATS: "Analyzing your top tracks..."
                },
                CREATING: {
                    SHUFFLE: "Queueing your playlist...",
                    RECENT: "Saving playlist...",
                    STATS: "Building your playlist..."
                },
                SUCCESS: {
                    TITLE: {
                        STARTED: "Job Started!",
                        SAVED: "Saved!",
                        QUEUED: "Playlist Queued!"
                    },
                    DESCRIPTION: {
                        BACKGROUND: "Your playlist is being created in the background.",
                        PERMANENT: "Your recent hits are now a permanent playlist.",
                        SOON: "We're compiling your top hits. It'll be ready soon."
                    }
                },
                READY: {
                    SHUFFLE: "Shuffled!",
                    RECENT: "History Found!",
                    STATS: "Top Tracks Ready!"
                }
            }
        }
    }
} as const;
