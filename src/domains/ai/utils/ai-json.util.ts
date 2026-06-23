export function stripCodeFences(text: string): string {
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return jsonText.trim();
}

function extractBalancedJson(text: string): string {
    const trimmed = text.trim();
    const startIndex = trimmed.search(/[\[{]/);

    if (startIndex === -1) {
        return trimmed;
    }

    const openingChar = trimmed[startIndex];
    const closingChar = openingChar === '[' ? ']' : '}';
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = startIndex; index < trimmed.length; index += 1) {
        const char = trimmed[index];

        if (inString) {
            if (isEscaped) {
                isEscaped = false;
                continue;
            }

            if (char === '\\') {
                isEscaped = true;
                continue;
            }

            if (char === '"') {
                inString = false;
            }

            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === openingChar) {
            depth += 1;
            continue;
        }

        if (char === closingChar) {
            depth -= 1;
            if (depth === 0) {
                return trimmed.slice(startIndex, index + 1);
            }
        }
    }

    return trimmed;
}

function repairCommonJsonIssues(text: string): string {
    let repaired = text;

    // Strip XML-like metadata tokens that leak into JSON at any structural position
    // (e.g. },<omniModel>  or  [<tag>). Must run first so downstream regexes see clean text.
    repaired = repaired.replace(/<[^"\r\n>]*>/g, '');

    // Quote bare placeholder-like values such as: "value": <omniModel> (handles unclosed tags missed above)
    repaired = repaired.replace(/:\s*<([^>\r\n,}\]]+)>/g, ': "$1"');

    // Quote bare words after a property when the model omits JSON quotes.
    repaired = repaired.replace(/:\s*([A-Za-z_][A-Za-z0-9_./-]*)(?=\s*[,}\]])/g, ': "$1"');

    // Remove trailing commas before object/array closing tokens.
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');

    return repaired;
}

// Closes unclosed strings and brackets produced by truncated model output.
function closeUnclosedJson(text: string): string {
    let result = text.trimEnd();
    const stack: string[] = [];
    let inString = false;
    let isEscaped = false;

    for (const char of result) {
        if (inString) {
            if (isEscaped) {
                isEscaped = false;
                continue;
            }
            if (char === '\\') {
                isEscaped = true;
                continue;
            }
            if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            stack.push('}');
        } else if (char === '[') {
            stack.push(']');
        } else if (char === '}' || char === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === char) {
                stack.pop();
            }
        }
    }

    if (inString) {
        result += '"';
    }

    // Drop trailing comma before closing open containers.
    result = result.replace(/,\s*$/, '');

    result += stack.reverse().join('');

    return result;
}

export function parseJsonOrThrow<T>(text: string): T {
    const cleaned = stripCodeFences(text);
    const extracted = extractBalancedJson(cleaned);

    try {
        return JSON.parse(extracted) as T;
    } catch {
        const repaired = repairCommonJsonIssues(extracted);
        try {
            return JSON.parse(repaired) as T;
        } catch {
            const closed = closeUnclosedJson(repaired);
            return JSON.parse(closed) as T;
        }
    }
}
