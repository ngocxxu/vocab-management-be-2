export function stripCodeFences(text: string): string {
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return jsonText.trim();
}

export function parseJsonOrThrow<T>(text: string): T {
    const cleaned = stripCodeFences(text);
    return JSON.parse(cleaned) as T;
}
