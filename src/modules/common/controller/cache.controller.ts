import { Controller, Delete, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../decorator/roles.decorator';
import { LoggerService } from '../provider/logger.service';
import { RedisService } from '../provider/redis.provider';
import { RolesGuard } from '../security/roles.guard';
import { CacheManagerService } from '../service/cache-manager.service';

@Controller('cache')
@ApiTags('cache')
@ApiBearerAuth()
export class CacheController {
    private readonly logger = new LoggerService();

    public constructor(
        private readonly cacheManagerService: CacheManagerService,
        private readonly redisService: RedisService,
    ) {}

    @Get('stats')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @ApiOperation({ summary: 'Get cache statistics (Admin only)' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Cache statistics',
        schema: {
            type: 'object',
            additionalProperties: {
                type: 'number',
            },
        },
    })
    public async getCacheStats(): Promise<Record<string, number>> {
        const stats = await this.cacheManagerService.getCacheStats();
        this.logger.info('Cache statistics retrieved');
        return stats;
    }

    @Delete('clear')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Clear all caches (Admin only)' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'All caches cleared successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string' },
            },
        },
    })
    public async clearAllCaches(): Promise<{ message: string }> {
        await this.cacheManagerService.clearAllCaches();
        this.logger.info('All caches cleared');
        return { message: 'All caches cleared successfully' };
    }

    @Delete('flush')
    @UseGuards(RolesGuard)
    @Roles([UserRole.ADMIN])
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Flush entire Redis database (Admin only - DANGEROUS)',
        description:
            'This will delete ALL keys in the Redis database, including sessions, queues, and other non-cache data. Use with extreme caution.',
    })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Redis database flushed successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string' },
            },
        },
    })
    public async flushDatabase(): Promise<{ message: string }> {
        await this.redisService.flushdb();
        this.logger.warn('Redis database flushed - all data deleted');
        return { message: 'Redis database flushed successfully' };
    }
}
