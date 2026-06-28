import axios from 'axios';
import { ChatHistoryMessage, ChatParams, ChatResponse } from './ai-provider.interface';

export abstract class OpenAiCompatibleProvider {
    protected abstract readonly apiKey: string;
    protected abstract readonly chatUrl: string;

    public async chat(params: ChatParams): Promise<ChatResponse> {
        const modelName = await this.getModelName();
        const resolvedModel = this.resolveModelName(modelName);
        const messages = this.buildOpenAiMessages(params.systemPrompt, params.history);
        const body = this.buildChatBody(resolvedModel, messages, params);
        try {
            const response = await axios.post<{
                choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
                usage?: { total_tokens?: number };
            }>(this.chatUrl, body, { headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, signal: params.signal });
            const msg = response.data.choices[0]?.message;
            if (msg?.tool_calls?.length) {
                const tc = msg.tool_calls[0];
                return { type: 'tool_call', name: tc.function.name, params: JSON.parse(tc.function.arguments) as unknown, toolCallId: tc.id };
            }
            return { type: 'text', content: msg?.content ?? '', tokenCount: response.data.usage?.total_tokens };
        } catch (error) {
            this.handleApiError(error, 'chat', resolvedModel);
            throw error;
        }
    }

    protected resolveModelName(modelName: string): string {
        return modelName;
    }

    protected buildChatBody(resolvedModel: string, messages: unknown[], params: ChatParams): Record<string, unknown> {
        const body: Record<string, unknown> = { model: resolvedModel, messages };
        if (params.tools.length > 0) {
            body.tools = params.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
            body.tool_choice = 'auto';
        }
        return body;
    }

    protected buildOpenAiMessages(systemPrompt: string, history: ChatHistoryMessage[]): unknown[] {
        const messages: unknown[] = [{ role: 'system', content: systemPrompt }];
        for (const msg of history) {
            if (msg.role === 'user') {
                messages.push({ role: 'user', content: msg.content });
            } else if (msg.role === 'assistant') {
                if (msg.toolCalls?.length) {
                    messages.push({
                        role: 'assistant',
                        content: null,
                        tool_calls: msg.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } })),
                    });
                } else {
                    messages.push({ role: 'assistant', content: msg.content });
                }
            } else if (msg.role === 'tool') {
                messages.push({ role: 'tool', tool_call_id: msg.toolCallId ?? '', content: msg.content });
            }
        }
        return messages;
    }

    protected abstract getModelName(userId?: string): Promise<string>;
    protected abstract handleApiError(error: unknown, operation: string, modelName: string): void;
}
