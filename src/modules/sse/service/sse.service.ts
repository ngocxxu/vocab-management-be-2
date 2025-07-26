import { Injectable, Logger } from '@nestjs/common';
import { IncomingMessage } from 'http';

export interface SSEConnection {
    userId: string;
    response: IncomingMessage | NodeJS.ReadableStream;
    connectedAt: Date;
}

@Injectable()
export class SSEService {
    private readonly logger = new Logger(SSEService.name);
    private readonly connections = new Map<string, SSEConnection>();

    /**
     * Add a new SSE connection for a user
     * @param userId - The user ID
     * @param response - The Fastify response object
     */
    public addConnection(userId: string, response: IncomingMessage | NodeJS.ReadableStream): void {
        // Remove existing connection for this user if any
        this.removeConnection(userId);

        const connection: SSEConnection = {
            userId,
            response,
            connectedAt: new Date(),
        };

        this.connections.set(userId, connection);
        this.logger.log(`SSE connection established for user: ${userId}`);
    }

    /**
     * Remove a user's SSE connection
     * @param userId - The user ID
     */
    public removeConnection(userId: string): void {
        const connection = this.connections.get(userId);
        if (connection) {
            this.connections.delete(userId);
            this.logger.log(`SSE connection removed for user: ${userId}`);
        }
    }

    /**
     * Send an event to a specific user
     * @param userId - The user ID to send the event to
     * @param event - The event data to send
     */
    public sendToUser(userId: string, event: Record<string, unknown>): boolean {
        const connection = this.connections.get(userId);
        if (!connection) {
            this.logger.warn(`No SSE connection found for user: ${userId}`);
            return false;
        }

        try {
            const eventData = `data: ${JSON.stringify(event)}\n\n`;
            if ('write' in connection.response && typeof connection.response.write === 'function') {
                (connection.response as { write: (data: string) => void }).write(eventData);
            }
            this.logger.debug(`Event sent to user: ${userId}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to send event to user ${userId}:`, error);
            this.removeConnection(userId);
            return false;
        }
    }

    /**
     * Send an event to multiple users
     * @param userIds - Array of user IDs to send the event to
     * @param event - The event data to send
     */
    public sendToUsers(userIds: string[], event: Record<string, unknown>): void {
        const results = userIds.map(userId => this.sendToUser(userId, event));
        const successCount = results.filter(result => result).length;
        this.logger.log(`Event sent to ${successCount}/${userIds.length} users`);
    }

    /**
     * Send an event to all connected users
     * @param event - The event data to send
     */
    public broadcast(event: Record<string, unknown>): void {
        const userIds = Array.from(this.connections.keys());
        this.sendToUsers(userIds, event);
    }

    /**
     * Get the number of active connections
     */
    public getConnectionCount(): number {
        return this.connections.size;
    }

    /**
     * Get all active user IDs
     */
    public getConnectedUsers(): string[] {
        return Array.from(this.connections.keys());
    }

    /**
     * Check if a user has an active connection
     * @param userId - The user ID to check
     */
    public isUserConnected(userId: string): boolean {
        return this.connections.has(userId);
    }

    /**
     * Clean up dead connections
     */
    public cleanupDeadConnections(): void {
        const deadConnections: string[] = [];

        for (const [userId, connection] of this.connections.entries()) {
            if ('destroyed' in connection.response && connection.response.destroyed) {
                deadConnections.push(userId);
            }
        }

        deadConnections.forEach(userId => this.removeConnection(userId));

        if (deadConnections.length > 0) {
            this.logger.log(`Cleaned up ${deadConnections.length} dead connections`);
        }
    }
}