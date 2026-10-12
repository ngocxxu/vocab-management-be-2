import { createBasicAuthMiddleware } from '@/shared';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';
import { AdminStatsController } from './controllers';
import { AdminStatsRepository } from './repositories';
import { AdminStatsService } from './services';

@Module({
    imports: [
        // Async so the credentials are read after ConfigModule has loaded .env, not at import time.
        BullBoardModule.forRootAsync({
            useFactory: () => ({
                route: '/admin/queues',
                adapter: ExpressAdapter,
                middleware: createBasicAuthMiddleware(process.env.BULL_BOARD_USER, process.env.BULL_BOARD_PASSWORD),
            }),
        }),
    ],
    controllers: [AdminStatsController],
    providers: [AdminStatsService, AdminStatsRepository],
})
export class AdminModule {}
