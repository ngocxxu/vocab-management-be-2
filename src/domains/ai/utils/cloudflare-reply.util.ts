/** A tool call in the shape the provider uses: `arguments` already parsed into an object. */
export type CloudflareToolCall = {
    id?: string;
    name: string;
    arguments: Record<string, unknown>;
};

type CloudflareOpenAiToolCall = {
    id?: string;
    type?: string;
    function: { name: string; arguments: string };
};

type CloudflareOpenAiChoice = {
    finish_reason?: string;
    message?: {
        role?: string;
        content?: string | null;
        tool_calls?: CloudflareOpenAiToolCall[];
    };
};

/**
 * The `result` of an `/ai/run` call. Older models fill `response` and top-level `tool_calls`.
 * Newer models answer in the OpenAI shape instead: `choices[0].message`.
 */
export type CloudflareChatResult = {
    response?: string | null;
    tool_calls?: CloudflareToolCall[];
    choices?: CloudflareOpenAiChoice[];
};

export type CloudflareReply = {
    text: string | null;
    toolCalls: CloudflareToolCall[];
};

/** Reads text and tool calls from either reply shape, so the shape a model uses never hides its answer. */
export function readCloudflareReply(result: CloudflareChatResult): CloudflareReply {
    const message = result.choices?.[0]?.message;

    return {
        text: result.response || message?.content || null,
        toolCalls: result.tool_calls?.length ? result.tool_calls : (message?.tool_calls ?? []).map(toToolCall),
    };
}

function toToolCall(call: CloudflareOpenAiToolCall): CloudflareToolCall {
    return {
        id: call.id,
        name: call.function.name,
        arguments: JSON.parse(call.function.arguments) as Record<string, unknown>,
    };
}
