
export function validateImageMagicBytes(base64String: string): boolean {
    if (!base64String) return false;

    // Strip metadata prefix if present
    const cleanBase64 = base64String.replace(/^data:image\/\w+;base64,/, '');

    try {
        // Decode first few bytes (need at least 8 for PNG signature)
        const buffer = Buffer.from(cleanBase64.substring(0, 20), 'base64');

        // Check for JPEG magic bytes: FF D8 FF
        const isJpeg = buffer.length >= 3 &&
            buffer[0] === 0xFF &&
            buffer[1] === 0xD8 &&
            buffer[2] === 0xFF;

        // Check for PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
        const isPng = buffer.length >= 8 &&
            buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4E &&
            buffer[3] === 0x47 &&
            buffer[4] === 0x0D &&
            buffer[5] === 0x0A &&
            buffer[6] === 0x1A &&
            buffer[7] === 0x0A;

        return isJpeg || isPng;
    } catch {
        return false;
    }
}

