import axios from "axios";

// API requests now go through Next.js rewrites (/api/* -> backend)
// This ensures same-origin for cookies, fixing mobile browser issues
export const api = axios.create({
    baseURL: "/api",
    withCredentials: true, // Send cookies with requests
    headers: {
        "Content-Type": "application/json",
    },
});

// Intercept demo mode restriction errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.data?.code === 'DEMO_MODE_RESTRICTED') {
            // Emit custom event that DemoToastProvider listens for
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('demo-mode-blocked'));
            }
        }
        return Promise.reject(error);
    }
);

export const fetcher = (url: string) => api.get(url).then((res) => res.data);


