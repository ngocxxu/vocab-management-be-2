export function extractCookieValue(cookieHeader: string | undefined, name: string): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.split(';').find((part) => part.trim().startsWith(`${name}=`));
    if (!match) return null;
    const value = match.trim().slice(name.length + 1);
    return value || null;
}
