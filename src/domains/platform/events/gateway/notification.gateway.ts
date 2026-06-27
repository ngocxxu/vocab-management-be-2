import type { TranslatedTextTargetResult } from '../../../ai/services/ai-translation.service';
import type { GenerateSubjectsDto } from '../../../catalog/subject/dto';
import { WsAuthService } from '@/auth';
import { getWsCorsOptions } from '@/shared';
import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MultipleChoiceQuestion } from '../../../ai/utils/type.util';

@WebSocketGateway({
    cors: getWsCorsOptions(),
    namespace: '/notification',
})
export class NotificationGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    public server: Server;

    private readonly logger = new Logger('NotificationGateway');

    public constructor(private readonly wsAuthService: WsAuthService) {}

    @SubscribeMessage('join-user-room')
    public handleJoinUserRoom(@ConnectedSocket() client: Socket): void {
        const userId = (client.data as Record<string, unknown>).userId as string | undefined;
        if (userId) {
            this.joinUserRoom(userId, client);
            client.emit('joined-user-room', { userId });
        }
    }

    public afterInit(): void {
        this.logger.log('Notification Gateway initialized');
    }

    public async handleConnection(client: Socket): Promise<void> {
        try {
            const authUser = await this.wsAuthService.authenticateSocket(client);
            client.data = { userId: authUser.id } as Record<string, unknown>;
            this.logger.log(`Notification client connected: ${client.id} userId=${authUser.id}`);
            client.emit('connected', { message: 'Connected to notifications', clientId: client.id });
        } catch {
            client.emit('auth_error', { message: 'Authentication failed', code: 'AUTH_FAILED' });
            client.disconnect();
        }
    }

    public handleDisconnect(client: Socket): void {
        this.logger.log(`Notification client disconnected: ${client.id}`);
    }

    public sendToAll(message: string, data?: unknown): void {
        this.server.emit('notification', { message, data, timestamp: new Date().toISOString() });
        this.logger.log(`Sent notification to all: ${message}`);
    }

    public sendToUser(userId: string, message: string, data?: unknown): void {
        this.server.to(`user-${userId}`).emit('notification', {
            message,
            data,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(`Sent notification to user ${userId}: ${message}`);
    }

    public joinUserRoom(userId: string, client: Socket): void {
        void client.join(`user-${userId}`);
        this.logger.log(`User ${userId} joined notification room`);
    }

    public emitAudioEvaluationProgress(
        userId: string,
        jobId: string,
        status: 'evaluating' | 'completed' | 'failed',
        data?: { transcript?: string; markdownReport?: string; error?: string },
    ): void {
        this.server.to(`user-${userId}`).emit('audio-evaluation-progress', {
            jobId,
            status,
            data,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(`Audio evaluation progress sent to user ${userId}: ${status}`);
    }

    public emitMultipleChoiceGenerationProgress(
        userId: string,
        jobId: string,
        status: 'generating' | 'completed' | 'failed',
        data?: { questions?: MultipleChoiceQuestion[]; error?: string },
    ): void {
        this.server.to(`user-${userId}`).emit('multiple-choice-generation-progress', {
            jobId,
            status,
            data,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(`Multiple choice generation progress sent to user ${userId}: ${status}`);
    }

    public emitSubjectGenerateResult(userId: string, jobId: string, textTarget: string, result: GenerateSubjectsDto): void {
        this.server.to(`user-${userId}`).emit('subject-generate-result', {
            jobId,
            textTarget,
            result,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(`Subject generate result sent to user ${userId}`);
    }

    public emitVocabGenerateTextTargetResult(userId: string, jobId: string, textSource: string, result: TranslatedTextTargetResult): void {
        this.server.to(`user-${userId}`).emit('vocab-generate-text-target-result', {
            jobId,
            textSource,
            result,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(`Vocab generate text target result sent to user ${userId}`);
    }

    public emitFillInBlankEvaluationProgress(
        userId: string,
        jobId: string,
        status: 'evaluating' | 'completed' | 'failed',
        data?: {
            evaluations?: Array<{ isCorrect: boolean; explanation?: string }>;
            results?: Array<{
                status: string;
                userSelected: string;
                systemSelected: string;
                data?: { explanation?: string };
            }>;
            error?: string;
        },
    ): void {
        this.server.to(`user-${userId}`).emit('fill-in-blank-evaluation-progress', {
            jobId,
            status,
            data,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(`Fill-in-blank evaluation progress sent to user ${userId}: ${status}`);
    }
}
