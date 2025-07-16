export enum RedisPrefix {
    VOCAB = 'vocab:',
    VOCAB_TRAINER = 'vocab-trainer:',
    USER = 'user:',
    SESSION = 'session:',
    CACHE = 'cache:',
    LOCK = 'lock:',
    QUEUE = 'queue:',
    NOTIFICATION = 'notification:',
    SUBJECT = 'subject:',
}

export class RedisKeyManager {
    /**
     * Separator for Redis keys
     */
    public static readonly SEPARATOR = ':';

    /**
     * Generate vocab-related keys
     */
    public static readonly vocab = {
        byId: (id: string) => this.generateKey(RedisPrefix.VOCAB, 'id', id),
        byTextSource: (textSource: string) =>
            this.generateKey(RedisPrefix.VOCAB, 'text', textSource),
        byLanguage: (sourceLang: string, targetLang: string) =>
            this.generateKey(RedisPrefix.VOCAB, 'lang', sourceLang, targetLang),
        bySubject: (subjectId: string) => this.generateKey(RedisPrefix.VOCAB, 'subject', subjectId),
        list: (filters?: string) => this.generateKey(RedisPrefix.VOCAB, 'list', filters || 'all'),
        count: () => this.generateKey(RedisPrefix.VOCAB, 'count'),
    };

    /**
     * Generate vocab-trainer-related keys
     */
    public static readonly vocabTrainer = {
        byId: (id: string) => this.generateKey(RedisPrefix.VOCAB_TRAINER, 'id', id),
        byStatus: (status: string) => this.generateKey(RedisPrefix.VOCAB_TRAINER, 'status', status),
        byUser: (userId: string) => this.generateKey(RedisPrefix.VOCAB_TRAINER, 'user', userId),
        questions: (trainerId: string) =>
            this.generateKey(RedisPrefix.VOCAB_TRAINER, 'questions', trainerId),
        results: (trainerId: string) =>
            this.generateKey(RedisPrefix.VOCAB_TRAINER, 'results', trainerId),
        progress: (trainerId: string, userId: string) =>
            this.generateKey(RedisPrefix.VOCAB_TRAINER, 'progress', trainerId, userId),
        list: (filters?: string) =>
            this.generateKey(RedisPrefix.VOCAB_TRAINER, 'list', filters || 'all'),
    };

    /**
     * Generate user-related keys
     */
    public static readonly user = {
        byId: (id: string) => this.generateKey(RedisPrefix.USER, 'id', id),
        byEmail: (email: string) => this.generateKey(RedisPrefix.USER, 'email', email),
        session: (userId: string) => this.generateKey(RedisPrefix.USER, 'session', userId),
        preferences: (userId: string) => this.generateKey(RedisPrefix.USER, 'preferences', userId),
        stats: (userId: string) => this.generateKey(RedisPrefix.USER, 'stats', userId),
        learningProgress: (userId: string) =>
            this.generateKey(RedisPrefix.USER, 'progress', userId),
    };

    /**
     * Generate session-related keys
     */
    public static readonly session = {
        byToken: (token: string) => this.generateKey(RedisPrefix.SESSION, 'token', token),
        byUserId: (userId: string) => this.generateKey(RedisPrefix.SESSION, 'user', userId),
        active: (userId: string) => this.generateKey(RedisPrefix.SESSION, 'active', userId),
    };

    /**
     * Generate cache-related keys
     */
    public static readonly cache = {
        api: (endpoint: string, params?: string) =>
            this.generateKey(RedisPrefix.CACHE, 'api', endpoint, params || ''),
        config: (key: string) => this.generateKey(RedisPrefix.CACHE, 'config', key),
        stats: (type: string) => this.generateKey(RedisPrefix.CACHE, 'stats', type),
    };

    /**
     * Generate lock-related keys
     */
    public static readonly lock = {
        resource: (resource: string, id: string) =>
            this.generateKey(RedisPrefix.LOCK, resource, id),
        user: (userId: string) => this.generateKey(RedisPrefix.LOCK, 'user', userId),
        trainer: (trainerId: string) => this.generateKey(RedisPrefix.LOCK, 'trainer', trainerId),
    };

    /**
     * Generate queue-related keys
     */
    public static readonly queue = {
        tasks: (type: string) => this.generateKey(RedisPrefix.QUEUE, 'tasks', type),
        notifications: () => this.generateKey(RedisPrefix.QUEUE, 'notifications'),
        emails: () => this.generateKey(RedisPrefix.QUEUE, 'emails'),
    };

    /**
     * Generate notification-related keys
     */
    public static readonly notification = {
        byId: (id: string) => this.generateKey(RedisPrefix.NOTIFICATION, 'id', id),
        byUser: (userId: string) => this.generateKey(RedisPrefix.NOTIFICATION, 'user', userId),
        unread: (userId: string) => this.generateKey(RedisPrefix.NOTIFICATION, 'unread', userId),
        count: (userId: string) => this.generateKey(RedisPrefix.NOTIFICATION, 'count', userId),
    };

    /**
     * Generate a Redis key with prefix
     */
    public static generateKey(prefix: RedisPrefix, ...parts: (string | number)[]): string {
        return `${prefix}${parts.join(this.SEPARATOR)}`;
    }

    /**
     * Get all keys by prefix
     */
    public static getPatternByPrefix(prefix: RedisPrefix): string {
        return `${prefix}*`;
    }

    /**
     * Extract prefix from a key
     */
    public static extractPrefix(key: string): RedisPrefix | null {
        for (const prefix of Object.values(RedisPrefix)) {
            if (key.startsWith(prefix)) {
                return prefix;
            }
        }
        return null;
    }

    /**
     * Extract parts from a key
     */
    public static extractParts(key: string): string[] {
        const prefix = this.extractPrefix(key);
        if (!prefix) return [];

        const parts = key.substring(prefix.length);
        return parts.split(this.SEPARATOR);
    }
}
