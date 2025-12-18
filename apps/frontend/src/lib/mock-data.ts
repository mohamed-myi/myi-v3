import { Artist, Track, UserProfile } from "./types";

export const MOCK_USER: UserProfile = {
    id: "user_1",
    displayName: "Mohamed",
    image: "https://i.scdn.co/image/ab6775700000ee8510255bd286289b4f4f7243c2",
};

export const HERO_ARTIST = {
    name: "The Weeknd",
    stats: "#1 All-Time Artist | 432 Hours Streamed",
    description: "The top artist in your history. You've spent 18 days listening to Starboy and After Hours.",
    image: "https://i.scdn.co/image/ab6761610000e5eb214f3cf1cbe7139c1e26ffbb", // The Weeknd
};

export const RECENTLY_PLAYED: Track[] = [
    {
        id: "1",
        name: "Starboy",
        artist: "The Weeknd",
        album: "Starboy",
        image: "https://i.scdn.co/image/ab67616d0000b2734718e28d64db8ddbd0636626",
    },
    {
        id: "2",
        name: "Instant Crush",
        artist: "Daft Punk",
        album: "Random Access Memories",
        image: "https://i.scdn.co/image/ab67616d0000b273b1d8f1e003c4f742f1a30703",
    },
    {
        id: "3",
        name: "Midnight City",
        artist: "M83",
        album: "Hurry Up, We're Dreaming",
        image: "https://i.scdn.co/image/ab67616d0000b273010b4279ab87e2247f0709b1",
    },
    {
        id: "4",
        name: "The Hills",
        artist: "The Weeknd",
        album: "Beauty Behind The Madness",
        image: "https://i.scdn.co/image/ab67616d0000b2739c394c86bf6d5ba8901ad394",
    },
    {
        id: "5",
        name: "Nightcall",
        artist: "Kavinsky",
        album: "OutRun",
        image: "https://i.scdn.co/image/ab67616d0000b273d2a70bf9d91f274a17961233",
    },
];

export const TOP_ARTISTS: Artist[] = [
    { id: "1", name: "The Weeknd", rank: 1, image: "https://i.scdn.co/image/ab6761610000e5eb214f3cf1cbe7139c1e26ffbb" },
    { id: "2", name: "Daft Punk", rank: 2, image: "https://i.scdn.co/image/ab6761610000e5eb285834b6e5113d092285806c" },
    { id: "3", name: "Kanye West", rank: 3, image: "https://i.scdn.co/image/ab6761610000e5eb867498c484f23e7f54c9394f" },
    { id: "4", name: "Drake", rank: 4, image: "https://i.scdn.co/image/ab6761610000e5eb4293385d324db8558179afd9" },
    { id: "5", name: "Tame Impala", rank: 5, image: "https://i.scdn.co/image/ab6761610000e5ebb5f9e28219c169fd4b9e83ed" },
    { id: "6", name: "Lana Del Rey", rank: 6, image: "https://i.scdn.co/image/ab6761610000e5eb2e0b6c62c2f42a1f4965251a" },
];

export const HISTORY_SECTIONS = [
    {
        title: "Today",
        items: [
            { id: "h1", name: "Starboy", artist: "The Weeknd", image: "https://i.scdn.co/image/ab67616d0000b2734718e28d64db8ddbd0636626" },
            { id: "h2", name: "I Feel It Coming", artist: "The Weeknd", image: "https://i.scdn.co/image/ab67616d0000b2734718e28d64db8ddbd0636626" },
            { id: "h3", name: "Die For You", artist: "The Weeknd", image: "https://i.scdn.co/image/ab67616d0000b2734718e28d64db8ddbd0636626" },
            { id: "h4", name: "Reminder", artist: "The Weeknd", image: "https://i.scdn.co/image/ab67616d0000b2734718e28d64db8ddbd0636626" },
        ]
    },
    {
        title: "Yesterday",
        items: [
            { id: "h5", name: "Get Lucky", artist: "Daft Punk", image: "https://i.scdn.co/image/ab67616d0000b273b1d8f1e003c4f742f1a30703" },
            { id: "h6", name: "Instant Crush", artist: "Daft Punk", image: "https://i.scdn.co/image/ab67616d0000b273b1d8f1e003c4f742f1a30703" },
            { id: "h7", name: "Lose Yourself to Dance", artist: "Daft Punk", image: "https://i.scdn.co/image/ab67616d0000b273b1d8f1e003c4f742f1a30703" },
            { id: "h8", name: "Doin' it Right", artist: "Daft Punk", image: "https://i.scdn.co/image/ab67616d0000b273b1d8f1e003c4f742f1a30703" },
            { id: "h9", name: "Fragments of Time", artist: "Daft Punk", image: "https://i.scdn.co/image/ab67616d0000b273b1d8f1e003c4f742f1a30703" },
        ]
    },
    {
        title: "Earlier this Week",
        items: [
            { id: "h10", name: "Midnight City", artist: "M83", image: "https://i.scdn.co/image/ab67616d0000b273010b4279ab87e2247f0709b1" },
            { id: "h11", name: "Reunion", artist: "M83", image: "https://i.scdn.co/image/ab67616d0000b273010b4279ab87e2247f0709b1" },
            { id: "h12", name: "Wait", artist: "M83", image: "https://i.scdn.co/image/ab67616d0000b273010b4279ab87e2247f0709b1" },
            { id: "h13", name: "Claudia Lewis", artist: "M83", image: "https://i.scdn.co/image/ab67616d0000b273010b4279ab87e2247f0709b1" },
        ]
    }
];
