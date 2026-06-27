import { WsAuthService } from '@/auth';
import { getWsCorsOptions } from '@/shared';
import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: getWsCorsOptions(),
    namespace: '/chat',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    public server!: Server;

    private readonly logger = new Logger('ChatGateway');

    public constructor(private readonly wsAuthService: WsAuthService) {}

    @SubscribeMessage('join-room')
    public handleJoinRoom(@MessageBody() data: { room: string }, @ConnectedSocket() client: Socket): void {
        void client.join(data.room);
        this.logger.log(`Client ${client.id} joined room: ${data.room}`);

        client.emit('joined-room', { room: data.room });
        client.to(data.room).emit('user-joined', {
            clientId: client.id,
            userId: (client.data as Record<string, unknown>).userId,
            room: data.room,
        });
    }

    @SubscribeMessage('send-message')
    public handleMessage(@MessageBody() data: { room: string; message: string }, @ConnectedSocket() client: Socket): void {
        const messageData = {
            message: data.message,
            userId: (client.data as Record<string, unknown>).userId,
            clientId: client.id,
            timestamp: new Date().toISOString(),
        };

        this.server.to(data.room).emit('new-message', messageData);
        this.logger.log(`Message sent to room ${data.room}: ${data.message}`);
    }

    public afterInit(): void {
        this.logger.log('Chat Gateway initialized');
    }

    public async handleConnection(client: Socket): Promise<void> {
        try {
            const authUser = await this.wsAuthService.authenticateSocket(client);
            client.data = { userId: authUser.id } as Record<string, unknown>;
            this.logger.log(`Chat client connected: ${client.id} userId=${authUser.id}`);
            client.emit('connected', { message: 'Connected to chat', clientId: client.id });
        } catch {
            client.emit('auth_error', { message: 'Authentication failed', code: 'AUTH_FAILED' });
            client.disconnect();
        }
    }

    public handleDisconnect(client: Socket): void {
        this.logger.log(`Chat client disconnected: ${client.id}`);
    }

    public sendToRoom(room: string, message: string, data?: unknown): void {
        this.server.to(room).emit('server-message', {
            message,
            data,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(`Server message sent to room ${room}: ${message}`);
    }
}
