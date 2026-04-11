import { Module, forwardRef } from '@nestjs/common';
import { EmailModule } from '../notification/email';
import { NotificationModule } from '../notification';
import { VocabTrainerModule } from '../vocab-trainer';

import { ActedCheckRegistry } from './strategies/acted-check.registry';
import { VocabTrainerActedCheckStrategy } from './strategies/vocab-trainer-acted-check.strategy';
import { ReminderController } from './controllers';
import { ReminderReconciliationService } from './reconciliation/reminder-reconciliation.service';
import { ReminderScheduleRepository } from './repositories/reminder-schedule.repository';
import { SchedulerPollerService } from './scheduler/scheduler-poller.service';
import { ReminderService, VocabTrainerReminderAfterExamService } from './services';

@Module({
    imports: [
        forwardRef(() => EmailModule),
        forwardRef(() => NotificationModule),
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
