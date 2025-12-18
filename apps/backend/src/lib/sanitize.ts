// Sanitize strings for safe logging (prevents log injection)
export function sanitizeForLog(input: string): string {
    if (!input) return '';

    return input
        // Remove newlines and control characters
        .replace(/[\n\r\t]/g, ' ')
        // Remove non-printable ASCII characters
        .replace(/[^\x20-\x7E]/g, '')
        // Limit length to prevent log flooding
        .slice(0, 200);
}

// Sanitize object values for logging
export function sanitizeObjectForLog(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = sanitizeForLog(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = '[object]';
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
}
