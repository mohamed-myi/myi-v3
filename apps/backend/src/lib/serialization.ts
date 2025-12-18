// Helper to serialize objects containing BigInts to JSON-safe objects.
// BigInts are converted to strings to preserve precision.
export const toJSON = (data: any): any => {
    if (data === null || data === undefined) {
        return data;
    }

    if (typeof data === 'bigint') {
        return data.toString();
    }

    if (Array.isArray(data)) {
        return data.map(toJSON);
    }

    if (typeof data === 'object') {
        // Handle Date objects explicitly if needed, or let JSON.stringify handle them
        if (data instanceof Date) {
            return data.toISOString();
        }

        const out: any = {};
        for (const key of Object.keys(data)) {
            out[key] = toJSON(data[key]);
        }
        return out;
    }

    return data;
};
