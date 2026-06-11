import axios from 'axios';

export function isAiRateLimitError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
        return error.response?.status === 429;
    }

    if (!(error instanceof Error)) {
        return false;
    }

    return error.message.includes('[429 Too Many Requests]') || error.message.includes('Rate limit exceeded') || error.message.includes('quota exceeded');
}
