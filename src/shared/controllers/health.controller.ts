import { Controller, Get } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../decorators/public.decorator';
import { PrismaService } from '../services/prisma.service';

@Controller('health')
@Public()
// Probes from the cluster come from one IP; they must never eat the rate limit.
@SkipThrottle()
export class HealthController {
    public constructor(
        private readonly health: HealthCheckService,
        private readonly prisma: PrismaService,
    ) {}

    @Get()
    public async healthCheck() {
        return this.health.check([
            async () => {
                await this.prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
                return { database: { status: 'up' } };
            },
            () => ({
                http: {
                    status: 'up',
                    uptime: process.uptime(),
                },
            }),
        ]);
    }
}
