import { createBasicAuthMiddleware } from '@/shared';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';

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
})
export class AdminModule {}
