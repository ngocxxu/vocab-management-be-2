import { Logger } from '@nestjs/common';
import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: { origin: '*', credentials: true },
    namespace: '/chat',
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    public server: Server;

    private readonly logger = new Logger('ChatGateway');

    @SubscribeMessage('join-room')
    public handleJoinRoom(
        @MessageBody() data: { room: string; userId?: string },
        @ConnectedSocket() client: Socket,
    ): void {
        void client.join(data.room);
        this.logger.log(`Client ${client.id} joined room: ${data.room}`);

        client.emit('joined-room', { room: data.room });
        client.to(data.room).emit('user-joined', {
            clientId: client.id,
            userId: data.userId,
            room: data.room,
        });
    }

    @SubscribeMessage('send-message')
    public handleMessage(
        @MessageBody() data: { room: string; message: string; userId?: string },
        @ConnectedSocket() client: Socket,
    ): void {
        const messageData = {
            message: data.message,
            userId: data.userId,
            clientId: client.id,
            timestamp: new Date().toISOString(),
        };

        this.server.to(data.room).emit('new-message', messageData);
        this.logger.log(`Message sent to room ${data.room}: ${data.message}`);
    }

    public afterInit(): void {
        this.logger.log('Chat Gateway initialized');
    }

    public handleConnection(client: Socket): void {
        this.logger.log(`Chat client connected: ${client.id}`);
        client.emit('connected', { message: 'Connected to chat', clientId: client.id });
    }

    public handleDisconnect(client: Socket): void {
        this.logger.log(`Chat client disconnected: ${client.id}`);
    }

    // Simple method to send message to room from server
    public sendToRoom(room: string, message: string, data?: unknown): void {
        this.server.to(room).emit('server-message', {
            message,
            data,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(`Server message sent to room ${room}: ${message}`);
    }
}
