/** Request body fragment that makes OpenAI-compatible APIs (Groq, OmniRoute, OpenRouter) reply with one JSON object. */
export const OPENAI_JSON_OBJECT_FORMAT = { response_format: { type: 'json_object' } } as const;

/** Gemini generation config that makes the model reply with JSON. */
export const GEMINI_JSON_GENERATION_CONFIG = { responseMimeType: 'application/json' } as const;
