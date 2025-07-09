import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

import { Public } from '../decorator/public.decorator';
import { PrismaService } from '../provider';

@Controller('health')
@Public()
export class HealthController {
    public constructor(
        private readonly health: HealthCheckService,
        private readonly database: PrismaHealthIndicator,
        private readonly prisma: PrismaService,
    ) {}

    @Get()
    public async healthCheck() {
        return this.health.check([
            async () => this.database.pingCheck('database', this.prisma),
            () => ({
                http: {
                    status: 'up',
                    uptime: process.uptime(),
                },
            }),
        ]);
    }
}
