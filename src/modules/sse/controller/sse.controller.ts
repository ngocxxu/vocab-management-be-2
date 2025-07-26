import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User as UserEntity } from '@prisma/client';
import { FastifyReply } from 'fastify';
import { AuthGuard } from '../../common';
import { CurrentUser } from '../../common/decorator/user.decorator';
import { SSEService } from '../service/sse.service';

@Controller('sse')
@ApiTags('sse')
@ApiBearerAuth()
export class SSEController {
    public constructor(private readonly sseService: SSEService) {}

    @Get('notifications')
    @UseGuards(AuthGuard)
    @ApiOperation({ summary: 'Establish SSE connection for notifications' })
    @ApiResponse({ status: HttpStatus.OK, description: 'SSE connection established' })
    public connect(
        @Res() response: FastifyReply,
        @CurrentUser() user: UserEntity,
    ): void {
        // Set SSE headers
        response.raw.writeHead(HttpStatus.OK, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control',
        });

        // Send initial connection event
        const initialEvent = `data: ${JSON.stringify({
            type: 'connection',
            message: 'SSE connection established',
            userId: user.id,
            timestamp: new Date().toISOString(),
        })}\n\n`;

        response.raw.write(initialEvent);

        // Register client connection
        this.sseService.addConnection(user.id, response.raw as unknown as NodeJS.ReadableStream);

        // Handle client disconnect
        response.raw.on('close', () => {
            this.sseService.removeConnection(user.id);
        });

        // Keep connection alive
        const keepAlive = setInterval(() => {
            if (response.raw.destroyed) {
                clearInterval(keepAlive);
                return;
            }
            response.raw.write(': keepalive\n\n');
        }, 30000); // Send keepalive every 30 seconds

        // Clean up on disconnect
        response.raw.on('close', () => {
            clearInterval(keepAlive);
        });
    }
}