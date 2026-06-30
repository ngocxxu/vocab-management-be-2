export const CLOUDFLARE_AI_MODEL_TIER = {
    // gemma-4-26b-a4b-it, glm-4.7-flash excluded — emit tool_call without tools in generateContent, returning null response
    // TEXT_GENERATION: ['@cf/meta/llama-3.2-3b-instruct'],
    TEXT_GENERATION: ['@cf/qwen/qwen3-30b-a3b-fp8'],
    // TEXT_GENERATION: ['@cf/zai-org/glm-4.7-flash'],
    // TEXT_GENERATION: ['@cf/meta/llama-3.1-8b-instruct-fp8'],
    AUDIO_TRANSCRIPTION: ['@cf/openai/whisper-large-v3-turbo', '@cf/openai/whisper', '@cf/openai/whisper-tiny-en', '@cf/deepgram/nova-3', '@cf/deepgram/flux'],
} as const;
