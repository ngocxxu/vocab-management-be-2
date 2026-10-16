import { LanguageModule } from '@/domains/catalog/language';
import { PlanModule } from '@/domains/catalog/plan';
import { WordTypeModule } from '@/domains/catalog/word-type';
import { Auth0ManagementModule } from '@/domains/identity/auth0-management';
import { UserModule } from '@/domains/identity/user';
import { createBasicAuthMiddleware } from '@/shared';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';
import { AdminLanguagesController, AdminPlansController, AdminStatsController, AdminUsersController, AdminWordTypesController } from './controllers';
import { AdminStatsRepository } from './repositories';
import { AdminStatsService, AdminUsersService } from './services';

@Module({
    imports: [
        UserModule,
        Auth0ManagementModule,
        PlanModule,
        LanguageModule,
        WordTypeModule,
        // Async so the credentials are read after ConfigModule has loaded .env, not at import time.
        BullBoardModule.forRootAsync({
            useFactory: () => ({
                route: '/admin/queues',
                adapter: ExpressAdapter,
                middleware: createBasicAuthMiddleware(process.env.BULL_BOARD_USER, process.env.BULL_BOARD_PASSWORD),
            }),
        }),
    ],
    controllers: [AdminStatsController, AdminUsersController, AdminPlansController, AdminLanguagesController, AdminWordTypesController],
    providers: [AdminStatsService, AdminStatsRepository, AdminUsersService],
})
export class AdminModule {}
