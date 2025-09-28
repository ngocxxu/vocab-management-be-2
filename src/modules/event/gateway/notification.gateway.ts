import { Logger } from '@nestjs/common';
import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: { origin: '*', credentials: true },
    namespace: '/notification',
})
export class NotificationGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
    @WebSocketServer()
    public server: Server;

    private readonly logger = new Logger('NotificationGateway');

    public afterInit(): void {
        this.logger.log('Notification Gateway initialized');
    }

    public handleConnection(client: Socket): void {
        this.logger.log(`Notification client connected: ${client.id}`);
        client.emit('connected', { message: 'Connected to notifications', clientId: client.id });
    }

    public handleDisconnect(client: Socket): void {
        this.logger.log(`Notification client disconnected: ${client.id}`);
    }

    // Simple method to send notification to all clients
    public sendToAll(message: string, data?: unknown): void {
        this.server.emit('notification', { message, data, timestamp: new Date().toISOString() });
        this.logger.log(`Sent notification to all: ${message}`);
    }

    // Simple method to send notification to specific user
    public sendToUser(userId: string, message: string, data?: unknown): void {
        this.server.to(`user-${userId}`).emit('notification', {
            message,
            data,
            timestamp: new Date().toISOString(),
        });
        this.logger.log(`Sent notification to user ${userId}: ${message}`);
    }

    // Allow users to join their personal notification room
    public joinUserRoom(userId: string, client: Socket): void {
        void client.join(`user-${userId}`);
        this.logger.log(`User ${userId} joined notification room`);
    }
}
