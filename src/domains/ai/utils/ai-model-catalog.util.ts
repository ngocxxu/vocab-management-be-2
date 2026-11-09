export const CATALOG_PROVIDERS = ['gemini', 'openrouter', 'groq', 'cloudflare'] as const;
export type CatalogProvider = (typeof CATALOG_PROVIDERS)[number];

export const CATALOG_KINDS = ['text', 'audio'] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export interface CatalogModel {
    id: string;
    name: string;
}

export interface GeminiModelRaw {
    name: string;
    displayName?: string;
    supportedGenerationMethods?: string[];
}

export interface GroqModelRaw {
    id: string;
    active?: boolean;
}

export interface OpenRouterModelRaw {
    id: string;
    name?: string;
    architecture?: { input_modalities?: string[]; output_modalities?: string[] };
}

export interface CloudflareModelRaw {
    name: string;
}

const GEMINI_NON_CHAT = /tts|image|lyria|transcribe|embedding|robotics|computer-use|deep-research|antigravity|nano-banana|omni|live/i;
const GROQ_NON_CHAT = /whisper|tts|orpheus|guard|safeguard/i;
const CLOUDFLARE_NON_CHAT = /guard|-lora$/i;

const byId = (a: CatalogModel, b: CatalogModel): number => a.id.localeCompare(b.id);

// Gemini transcribes through generateContent with audio input, so both kinds share one filter.
export const mapGeminiModels = (raw: GeminiModelRaw[]): CatalogModel[] =>
    raw
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && !GEMINI_NON_CHAT.test(m.name))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }))
        .sort(byId);

export const mapGroqModels = (raw: GroqModelRaw[], kind: CatalogKind): CatalogModel[] =>
    raw
        .filter((m) => m.active !== false && (kind === 'audio' ? /whisper/i.test(m.id) : !GROQ_NON_CHAT.test(m.id)))
        .map((m) => ({ id: m.id, name: m.id }))
        .sort(byId);

// OpenRouter audio goes through chat with audio input, so keep models that accept audio.
export const mapOpenRouterModels = (raw: OpenRouterModelRaw[], kind: CatalogKind): CatalogModel[] =>
    raw
        .filter((m) => {
            const input = m.architecture?.input_modalities;
            const output = m.architecture?.output_modalities;
            if (output && !output.includes('text')) return false;
            return kind === 'audio' ? !!input?.includes('audio') : true;
        })
        .map((m) => ({ id: m.id, name: m.name || m.id }))
        .sort(byId);

// The Cloudflare task filter already separates text from speech models, so only guard/lora variants are dropped here.
export const mapCloudflareModels = (raw: CloudflareModelRaw[]): CatalogModel[] =>
    raw
        .filter((m) => !CLOUDFLARE_NON_CHAT.test(m.name))
        .map((m) => ({ id: m.name, name: m.name }))
        .sort(byId);
