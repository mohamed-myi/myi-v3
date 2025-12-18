import axios from "axios";

// Environment variable for API URL, defaulting to local backend
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001";

export const api = axios.create({
    baseURL: API_URL,
    withCredentials: true, // Send cookies with requests
    headers: {
        "Content-Type": "application/json",
    },
});

export const fetcher = (url: string) => api.get(url).then((res) => res.data);
