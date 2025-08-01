import { Controller, Get, HttpStatus, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { User as UserEntity } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthGuard } from '../../common';
import { CurrentUser } from '../../common/decorator/user.decorator';
import { SSEService } from '../service/sse.service';

@Controller('sse')
@ApiTags('sse')
@ApiBearerAuth()
export class SSEController {
    public constructor(private readonly sseService: SSEService) {}

    @Get('events')
    @UseGuards(AuthGuard)
    @ApiOperation({ summary: 'Establish SSE connection for events' })
    @ApiResponse({ status: HttpStatus.OK, description: 'SSE connection established' })
    public connect(@Req() request: FastifyRequest, @Res() response: FastifyReply, @CurrentUser() user: UserEntity): void {
        // Get allowed origins from environment or use default
        const allowedOrigins = process.env.API_CORS_ORIGINS?.split(',') || ['http://localhost:5173'];

        // Get the requesting origin
        const requestOrigin = request.headers.origin || 'http://localhost:5173';

        // Find the matching domain from allowed origins
        const corsOrigin = allowedOrigins.find(origin => origin === requestOrigin) || 'http://localhost:5173';

        // Set SSE headers with proper CORS for cookie-based authentication
        response.raw.writeHead(HttpStatus.OK, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Allow-Credentials': 'true',
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
