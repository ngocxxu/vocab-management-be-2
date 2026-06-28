import { AiProviderFactory } from '@/domains/ai/providers/ai-provider.factory';
import { ChatHistoryMessage, IAiProvider } from '@/domains/ai/providers/ai-provider.interface';
import { UserRepository } from '@/domains/identity/user/repositories/user.repository';
import { QUEUE_CONFIG } from '@/queues/config/queue.config';
import { JOB_NAMES } from '@/queues/constants/queue.constants';
import type { AiChatJobData } from '@/queues/interfaces/job-payloads';
import { LoggerService, RedisPrefix, RedisService, RedisPubSubService } from '@/shared';
import { captureSentryException } from '@/shared/utils/sentry.util';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { ChatRole, UserRole } from '@prisma/client';
import { Job } from 'bullmq';
import { nanoid } from 'nanoid';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { EReminderType } from '../../reminder/utils';
import { CHAT_CANCEL_KEY, CHAT_CHANNELS, CHAT_CONFIRM_TIMEOUT_MS } from '../constants';
import { ChatMessageRepository } from '../repositories';
import { AbortControllerRegistry } from '../services/abort-controller-registry.service';
import { McpToolRegistry } from '../services/mcp-tool-registry.service';

const TIER_MAX_ITERATIONS: Record<string, number> = { ADMIN: 4, MEMBER: 3, GUEST: 2 };
const FALLBACK_MESSAGE = "I wasn't able to complete this in the allowed steps. Please try rephrasing.";
const OUT_OF_SCOPE_MESSAGE = 'Sorry, I can only help with app-related questions.';
const CANCELLED_MESSAGE = 'Generation cancelled.';

@Processor(EReminderType.AI_CHAT)
export class ChatProcessor {
    public constructor(
        private readonly redisPubSub: RedisPubSubService,
        private readonly redisService: RedisService,
        private readonly aiProviderFactory: AiProviderFactory,
        private readonly userRepository: UserRepository,
        private readonly chatMessageRepository: ChatMessageRepository,
        private readonly mcpToolRegistry: McpToolRegistry,
        private readonly abortRegistry: AbortControllerRegistry,
        private readonly logger: LoggerService,
    ) {}

    @Process({ name: JOB_NAMES.aiChat, concurrency: QUEUE_CONFIG[EReminderType.AI_CHAT].concurrency })
    public async handleChatJob(job: Job<AiChatJobData>): Promise<void> {
        const { userId, messageId, tier } = job.data;

        if (await this.isCancelled(userId)) return;

        const signal = this.abortRegistry.create(userId);
        const startTime = Date.now();
        this.logger.info(`chat.job.start userId=${userId} tier=${tier} jobId=${String(job.id)}`);

        try {
            const { provider, systemPrompt, history } = await this.buildContext(userId, tier, messageId);
            const intent = await this.classifyIntent(provider, userId, history[history.length - 1]?.content ?? '', signal);
            this.logger.info(`chat.intent userId=${userId} intent=${intent}`);

            if (intent === 'OUT_OF_SCOPE') {
                await this.chatMessageRepository.create(userId, ChatRole.ASSISTANT, OUT_OF_SCOPE_MESSAGE);
                await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: OUT_OF_SCOPE_MESSAGE });
                return;
            }

            await this.runAgenticLoop({ provider, systemPrompt, history, tier, userId, startTime, signal });
        } catch (error) {
            if ((error as { code?: string })?.code === 'ERR_CANCELED' || (error instanceof Error && error.name === 'CanceledError')) {
                this.logger.info(`chat.job.aborted userId=${userId} jobId=${String(job.id)}`);
                await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: CANCELLED_MESSAGE });
                return;
            }
            this.logger.error(`chat.job.failed userId=${userId} error=${error instanceof Error ? error.message : String(error)} jobId=${String(job.id)}`);
            throw error;
        } finally {
            this.abortRegistry.delete(userId);
        }
    }

    @OnQueueFailed()
    public async handleJobFailed(job: Job<AiChatJobData>, error: Error): Promise<void> {
        const { userId } = job.data;
        const maxAttempts = job.opts?.attempts ?? 3;
        if (job.attemptsMade >= maxAttempts) {
            await this.redisPubSub.publish(CHAT_CHANNELS.error(userId), {
                message: 'AI service error. Please try again later.',
                retryable: false,
            });
            captureSentryException(error, { tags: { userId, jobId: String(job.id) } });
            this.logger.error(`chat.job.dlq userId=${userId} jobId=${String(job.id)} error=${error.message}`);
        }
    }

    private async isCancelled(userId: string): Promise<boolean> {
        const cancelled = await this.redisService.get(RedisPrefix.CHAT, CHAT_CANCEL_KEY(userId));
        if (!cancelled) return false;
        await this.redisService.del(RedisPrefix.CHAT, CHAT_CANCEL_KEY(userId));
        await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: CANCELLED_MESSAGE });
        return true;
    }

    private async buildContext(userId: string, tier: string, messageId: string): Promise<{ provider: IAiProvider; systemPrompt: string; history: ChatHistoryMessage[] }> {
        const [provider, user, dbMessages] = await Promise.all([
            this.aiProviderFactory.getProvider(userId),
            this.userRepository.findById(userId),
            this.chatMessageRepository.findLastN(userId, 10),
        ]);

        const currentMessage = dbMessages.find((m) => m.id === messageId);
        if (!currentMessage) throw new Error(`Chat message ${messageId} not found for userId ${userId}`);

        const userContext = user ? `Name: ${user.firstName} ${user.lastName}, Tier: ${user.role}` : `Tier: ${tier}`;
        const systemPrompt = `You are an AI assistant inside a vocabulary learning app.
You ONLY answer questions related to: vocabulary, learning progress, folders, trainer sessions, reminders, and features of this application.
If the user asks about anything unrelated to the app, politely refuse.
User context: ${userContext}`;

        const history: ChatHistoryMessage[] = dbMessages
            .filter((m) => m.id !== messageId)
            .map((m) => ({ role: m.role === ChatRole.USER ? ('user' as const) : ('assistant' as const), content: m.message }));
        history.push({ role: 'user', content: currentMessage.message });

        return { provider, systemPrompt, history };
    }

    private async classifyIntent(provider: IAiProvider, userId: string, userMessage: string, signal?: AbortSignal): Promise<string> {
        const intentPrompt = `Classify the intent. Reply with exactly APP or OUT_OF_SCOPE.
APP = vocabulary, learning progress, folders, trainer sessions, reminders, features of this application, greetings, or general conversational messages.
OUT_OF_SCOPE = unrelated topics (general knowledge, coding, news, politics, etc).
Message: ${userMessage}`;
        try {
            const result = await provider.generateContent(intentPrompt, userId, { signal });
            return result.trim().toUpperCase().includes('OUT_OF_SCOPE') ? 'OUT_OF_SCOPE' : 'APP';
        } catch (error) {
            if ((error as { code?: string })?.code === 'ERR_CANCELED' || (error instanceof Error && error.name === 'CanceledError')) throw error;
            return 'APP'; // fail open on non-abort errors
        }
    }

    private async runAgenticLoop(ctx: {
        provider: IAiProvider;
        systemPrompt: string;
        history: ChatHistoryMessage[];
        tier: string;
        userId: string;
        startTime: number;
        signal?: AbortSignal;
    }): Promise<void> {
        const { provider, systemPrompt, history, tier, userId, startTime, signal } = ctx;
        const tierRole = Object.values(UserRole).includes(tier as UserRole) ? (tier as UserRole) : UserRole.GUEST;
        const toolDeclarations = this.mcpToolRegistry.getToolsForTier(tierRole).map((t) => ({
            name: t.name,
            description: t.description,
            parameters: zodToJsonSchema(t.schema as never, { $refStrategy: 'none' }) as Record<string, unknown>,
        }));

        const maxIterations = TIER_MAX_ITERATIONS[tier] ?? 2;
        const toolCallsMeta: Array<{ toolName: string; success: boolean; latencyMs: number }> = [];

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            if (await this.isCancelled(userId)) return;
            const response = await provider.chat({ systemPrompt, history, tools: toolDeclarations, signal });

            if (response.type === 'text') {
                const latencyMs = Date.now() - startTime;
                const content = response.content || 'Please try again.';
                await this.chatMessageRepository.create(userId, ChatRole.ASSISTANT, content, toolCallsMeta, response.tokenCount, latencyMs);
                await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content });
                this.logger.info(`chat.job.done userId=${userId} tokens=${response.tokenCount ?? 0} latencyMs=${latencyMs} tools=${toolCallsMeta.length} iter=${iteration + 1}`);
                return;
            }

            const tool = this.mcpToolRegistry.getToolByName(response.name);
            history.push({ role: 'assistant', content: '', toolCalls: [{ id: response.toolCallId, name: response.name, arguments: JSON.stringify(response.params) }] });

            const toolStart = Date.now();
            let toolResult: string;
            let toolSuccess = false;

            if (tool?.isWrite) {
                const requestId = nanoid();
                await this.redisPubSub.publish(CHAT_CHANNELS.event(userId), {
                    type: 'confirm_required',
                    requestId,
                    action: response.name,
                    params: response.params,
                });

                let confirmed = false;
                try {
                    const decision = await this.redisPubSub.subscribeOnce(CHAT_CHANNELS.confirm(userId, requestId), CHAT_CONFIRM_TIMEOUT_MS);
                    confirmed = decision === 'confirmed';
                } catch {
                    // timeout → treat as rejected
                }

                if (!confirmed) {
                    toolCallsMeta.push({ toolName: response.name, success: false, latencyMs: Date.now() - toolStart });
                    history.push({ role: 'tool', content: 'User declined', toolCallId: response.toolCallId, toolName: response.name });
                    continue;
                }
            }

            await this.redisPubSub.publish(CHAT_CHANNELS.event(userId), { type: 'tool_used', toolName: response.name, label: tool?.description ?? response.name });

            try {
                if (!tool) throw new Error(`Unknown tool: ${response.name}`);
                const rawResult = await Promise.race([
                    tool.execute(tool.schema.parse(response.params), userId),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Tool timed out')), tool.timeoutMs)),
                ]);
                toolResult = JSON.stringify(rawResult).substring(0, 2000);
                toolSuccess = true;
                this.logger.info(`chat.tool.called toolName=${response.name} success=true latencyMs=${Date.now() - toolStart} userId=${userId}`);
            } catch (err) {
                toolResult = err instanceof Error ? err.message : 'Tool execution failed';
                this.logger.warn(`chat.tool.error toolName=${response.name} error=${toolResult} userId=${userId}`);
            }

            toolCallsMeta.push({ toolName: response.name, success: toolSuccess, latencyMs: Date.now() - toolStart });
            history.push({ role: 'tool', content: toolResult, toolCallId: response.toolCallId, toolName: response.name });
        }

        this.logger.warn(`chat.job.exhausted userId=${userId} maxIterations=${maxIterations}`);
        captureSentryException(new Error('Agentic loop max iterations exhausted'), { tags: { userId } });
        await this.chatMessageRepository.create(userId, ChatRole.ASSISTANT, FALLBACK_MESSAGE, toolCallsMeta);
        await this.redisPubSub.publish(CHAT_CHANNELS.done(userId), { content: FALLBACK_MESSAGE });
    }
}
