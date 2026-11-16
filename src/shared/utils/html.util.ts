const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/** Escapes a value for HTML text or a quoted attribute. A missing value becomes an empty string. */
export function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Returns the link escaped for an attribute when it is an absolute http or https URL, otherwise null. */
export function toSafeHttpUrl(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? escapeHtml(url.toString()) : null;
    } catch {
        return null;
    }
}
