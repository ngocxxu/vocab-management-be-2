import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { CommonModule } from '../common';
import { ActedCheckRegistry } from './acted-check/acted-check.registry';
import { VocabTrainerActedCheckStrategy } from './acted-check/vocab-trainer-acted-check.strategy';
import { ReminderController } from './controller';
import { ReminderReconciliationService } from './reconciliation/reminder-reconciliation.service';
import { ReminderScheduleRepository } from './repository/reminder-schedule.repository';
import { SchedulerPollerService } from './scheduler/scheduler-poller.service';
import { ReminderService, VocabTrainerReminderAfterExamService } from './service';
import { EReminderType } from './util';

@Module({
    imports: [
        CommonModule,
        BullModule.registerQueue({
            name: EReminderType.EMAIL_REMINDER,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.EMAIL_REMINDER,
            adapter: BullAdapter,
        }),
        BullModule.registerQueue({
            name: EReminderType.NOTIFICATION,
        }),
        BullBoardModule.forFeature({
            name: EReminderType.NOTIFICATION,
            adapter: BullAdapter,
        }),
    ],
    controllers: [ReminderController],
    providers: [
        ReminderService,
        ReminderScheduleRepository,
        VocabTrainerActedCheckStrategy,
        ActedCheckRegistry,
        VocabTrainerReminderAfterExamService,
        SchedulerPollerService,
        ReminderReconciliationService,
    ],
    exports: [
        ReminderService,
        ReminderScheduleRepository,
        VocabTrainerReminderAfterExamService,
        ActedCheckRegistry,
    ],
})
export class ReminderModule {}
