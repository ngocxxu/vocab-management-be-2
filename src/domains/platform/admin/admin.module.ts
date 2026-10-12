import { createBasicAuthMiddleware } from '@/shared/utils/basic-auth.middleware';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';

@Module({
    imports: [
        BullBoardModule.forRoot({
            route: '/admin/queues',
            adapter: ExpressAdapter,
            middleware: createBasicAuthMiddleware(process.env.BULL_BOARD_USER, process.env.BULL_BOARD_PASSWORD),
        }),
    ],
})
export class AdminModule {}
