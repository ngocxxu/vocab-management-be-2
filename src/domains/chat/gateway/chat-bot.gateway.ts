import { AuthTokenService } from '@/auth';
import { LoggerService, RedisPrefix, RedisService, RedisPubSubService, getWsCorsOptions } from '@/shared';
import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { CHAT_CANCEL_KEY, CHAT_CANCEL_TTL_SECONDS, CHAT_CHANNELS, CHAT_RATE_LIMITS, CHAT_RATE_LIMIT_WINDOW_SECONDS } from '../constants';
import { SendMessageDto } from '../dto';
import { ChatService } from '../services';

interface ConnectedUser {
    userId: string;
    tier: string;
    handlers: {
        done: (msg: string) => void;
        error: (msg: string) => void;
        event: (msg: string) => void;
    };
}

@WebSocketGateway({
    cors: getWsCorsOptions(),
    namespace: '/chat-bot',
})
export class ChatBotGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    public server: Server;

    private readonly logger = new Logger(ChatBotGateway.name);
    private readonly connectedUsers = new Map<string, ConnectedUser>();

    public constructor(
        private readonly chatService: ChatService,
        private readonly authTokenService: AuthTokenService,
        private readonly redisPubSub: RedisPubSubService,
        private readonly redisService: RedisService,
        private readonly loggerService: LoggerService,
    ) {}

    @SubscribeMessage('send_message')
    public async handleSendMessage(@MessageBody() body: unknown, @ConnectedSocket() client: Socket): Promise<void> {
        const user = this.connectedUsers.get(client.id);
        if (!user) {
            client.emit('ai_error', { message: 'Not authenticated', retryable: false, code: 'AUTH_REQUIRED' });
            return;
        }

        const dto = plainToInstance(SendMessageDto, body);
        const errors = await validate(dto);
        if (errors.length > 0) {
            client.emit('ai_error', { message: 'Message too long', retryable: false, code: 'MESSAGE_TOO_LONG' });
            return;
        }

        if (!(await this.checkRateLimit(user.userId, user.tier))) {
            client.emit('ai_error', { message: 'Rate limit exceeded. Please slow down.', retryable: true, code: 'RATE_LIMITED' });
            return;
        }

        try {
            const messageId = await this.chatService.saveAndEnqueue(user.userId, dto.content, user.tier);
            client.emit('message_queued', { messageId });
        } catch {
            client.emit('ai_error', { message: 'Failed to queue request', retryable: true, code: 'ENQUEUE_FAILED' });
        }
    }

    @SubscribeMessage('cancel_generation')
    public async handleCancelGeneration(@ConnectedSocket() client: Socket): Promise<void> {
        const user = this.connectedUsers.get(client.id);
        if (!user) return;
        await this.redisService.set(RedisPrefix.CHAT, CHAT_CANCEL_KEY(user.userId), '1', CHAT_CANCEL_TTL_SECONDS);
        this.loggerService.info(`Chat cancel requested: userId=${user.userId}`);
    }

    @SubscribeMessage('load_history')
    public async handleLoadHistory(@MessageBody() body: { cursor?: string }, @ConnectedSocket() client: Socket): Promise<void> {
        const user = this.connectedUsers.get(client.id);
        if (!user) return;
        try {
            const { items, nextCursor } = await this.chatService.getHistory(user.userId, body?.cursor);
            client.emit('history_loaded', { messages: items, nextCursor });
        } catch (err) {
            this.logger.warn(`Failed to load history for userId=${user.userId}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    @SubscribeMessage('confirm_response')
    public async handleConfirmResponse(@MessageBody() body: { confirmed: boolean; requestId: string }, @ConnectedSocket() client: Socket): Promise<void> {
        const user = this.connectedUsers.get(client.id);
        if (!user || !body?.requestId) return;
        await this.redisPubSub.publish(CHAT_CHANNELS.confirm(user.userId, body.requestId), body.confirmed ? 'confirmed' : 'rejected');
    }

    public afterInit(): void {
        this.logger.log('ChatBotGateway initialized');
    }

    public async handleConnection(client: Socket): Promise<void> {
        try {
            const token = this.extractToken(client);
            if (!token) {
                client.emit('ai_error', { message: 'Missing auth token', retryable: false, code: 'MISSING_TOKEN' });
                client.disconnect();
                return;
            }

            const authUser = await this.authTokenService.resolveAuthUser(token, 'combined');
            const tier = authUser.roles[0] ?? 'GUEST';

            const doneHandler = (msg: string): void => {
                try {
                    const payload = JSON.parse(msg) as unknown;
                    client.emit('ai_done', payload);
                } catch {
                    this.logger.warn(`Failed to parse done payload for userId=${authUser.id}`);
                }
            };

            const errorHandler = (msg: string): void => {
                try {
                    const payload = JSON.parse(msg) as unknown;
                    client.emit('ai_error', payload);
                } catch {
                    this.logger.warn(`Failed to parse error payload for userId=${authUser.id}`);
                }
            };

            const eventHandler = (msg: string): void => {
                try {
                    const payload = JSON.parse(msg) as { type: string };
                    if (payload.type === 'tool_used') {
                        client.emit('ai_tool_used', payload);
                    } else if (payload.type === 'confirm_required') {
                        client.emit('ai_confirm_required', payload);
                    }
                } catch {
                    this.logger.warn(`Failed to parse event payload for userId=${authUser.id}`);
                }
            };

            this.redisPubSub.subscribe(CHAT_CHANNELS.done(authUser.id), doneHandler);
            this.redisPubSub.subscribe(CHAT_CHANNELS.error(authUser.id), errorHandler);
            this.redisPubSub.subscribe(CHAT_CHANNELS.event(authUser.id), eventHandler);

            this.connectedUsers.set(client.id, {
                userId: authUser.id,
                tier,
                handlers: { done: doneHandler, error: errorHandler, event: eventHandler },
            });

            client.data = { userId: authUser.id, tier } as Record<string, unknown>;
            await this.chatService.ensureGreeting(authUser.id);
            this.loggerService.info(`ChatBot client connected: socketId=${client.id} userId=${authUser.id}`);
        } catch {
            client.emit('ai_error', { message: 'Authentication failed', retryable: false, code: 'AUTH_FAILED' });
            client.disconnect();
        }
    }

    public handleDisconnect(client: Socket): void {
        const user = this.connectedUsers.get(client.id);
        if (user) {
            this.redisPubSub.unsubscribe(CHAT_CHANNELS.done(user.userId), user.handlers.done);
            this.redisPubSub.unsubscribe(CHAT_CHANNELS.error(user.userId), user.handlers.error);
            this.redisPubSub.unsubscribe(CHAT_CHANNELS.event(user.userId), user.handlers.event);
            this.connectedUsers.delete(client.id);
            this.loggerService.info(`ChatBot client disconnected: socketId=${client.id} userId=${user.userId}`);
        }
    }

    private async checkRateLimit(userId: string, tier: string): Promise<boolean> {
        const key = `chat:ratelimit:${userId}`;
        const count = await this.redisService.client.incr(key);
        if (count === 1) await this.redisService.client.expire(key, CHAT_RATE_LIMIT_WINDOW_SECONDS);
        return count <= (CHAT_RATE_LIMITS[tier] ?? CHAT_RATE_LIMITS.GUEST);
    }

    private extractToken(client: Socket): string | null {
        const authHeader = client.handshake.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }
        const authData = client.handshake.auth as Record<string, unknown>;
        if (typeof authData?.token === 'string') {
            return authData.token;
        }
        return null;
    }
}
