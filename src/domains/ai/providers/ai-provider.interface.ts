export interface GenerateContentOptions {
    audioBuffer?: Buffer;
    audioMimeType?: string;
    signal?: AbortSignal;
}

export interface ChatHistoryMessage {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
    toolName?: string;
}

export interface McpToolDeclaration {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

export interface ChatParams {
    systemPrompt: string;
    history: ChatHistoryMessage[];
    tools: McpToolDeclaration[];
    signal?: AbortSignal;
}

export type ChatResponse = { type: 'text'; content: string; tokenCount?: number } | { type: 'tool_call'; name: string; params: unknown; toolCallId: string };

export interface IAiProvider {
    generateContent(prompt: string, userId?: string, options?: GenerateContentOptions): Promise<string>;

    transcribeAudio(audioBuffer: Buffer, mimeType: string, sourceLanguage: string, userId?: string): Promise<string>;

    getModelName(userId?: string): Promise<string>;

    getAudioModelName(userId?: string): Promise<string>;

    chat(params: ChatParams): Promise<ChatResponse>;
}

/**
 * 'RETRIEVAL_DOCUMENT' when embedding content to be searched (a vocab),
 * 'RETRIEVAL_QUERY' when embedding the user's search string. Using the same
 * value for both silently degrades result quality — no error, no log.
 */
export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/**
 * Deliberately NOT part of IAiProvider — that interface demands
 * generateContent/transcribeAudio/chat, none of which an embedding client
 * implements.
 */
export interface IEmbeddingProvider {
    embed(text: string, taskType: EmbeddingTaskType): Promise<number[]>;
}
