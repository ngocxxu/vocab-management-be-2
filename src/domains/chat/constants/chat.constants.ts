export const CHAT_CHANNELS = {
    done: (userId: string) => `chat:${userId}:done`,
    error: (userId: string) => `chat:${userId}:error`,
    event: (userId: string) => `chat:${userId}:event`,
    confirm: (userId: string, requestId: string) => `chat:${userId}:confirm:${requestId}`,
};

export const CHAT_CANCEL_KEY = (userId: string): string => `${userId}:cancelled`;
export const CHAT_CANCEL_TTL_SECONDS = 300;
export const CHAT_MAX_MESSAGE_LENGTH = 300;
export const CHAT_HISTORY_DEFAULT_LIMIT = 10;
export const CHAT_HISTORY_MAX_LIMIT = 50;

export const CHAT_RATE_LIMITS: Record<string, number> = { ADMIN: 100, MEMBER: 30, GUEST: 10 };
export const CHAT_RATE_LIMIT_WINDOW_SECONDS = 60;
export const CHAT_CONFIRM_TIMEOUT_MS = 30_000;
