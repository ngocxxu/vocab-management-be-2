import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { VocabTrainerModule } from '../vocab-trainer/vocab-trainer.module';

import { ActedCheckRegistry } from './strategies/acted-check.registry';
import { VocabTrainerActedCheckStrategy } from './strategies/vocab-trainer-acted-check.strategy';
import { ReminderController } from './controllers';
import { ReminderReconciliationService } from './reconciliation/reminder-reconciliation.service';
import { ReminderScheduleRepository } from './repositories/reminder-schedule.repository';
import { SchedulerPollerService } from './scheduler/scheduler-poller.service';
import { ReminderService, VocabTrainerReminderAfterExamService } from './services';
import { EReminderType } from './utils';

@Module({
    imports: [
        BullModule.registerQueue({ name: EReminderType.EMAIL_REMINDER }),
        BullModule.registerQueue({ name: EReminderType.NOTIFICATION }),
        forwardRef(() => VocabTrainerModule),
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
