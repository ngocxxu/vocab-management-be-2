import { Controller, Get } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';

import { Public } from '../decorators/public.decorator';
import { PrismaService } from '../services/prisma.service';

@Controller('health')
@Public()
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
