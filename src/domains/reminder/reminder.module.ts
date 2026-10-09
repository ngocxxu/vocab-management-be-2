import { Module, forwardRef } from '@nestjs/common';
import { NotificationModule } from '../notification';
import { EmailModule } from '../notification/email';
import { ConfigModule } from '../platform/config/config.module';
import { VocabModule } from '../vocab';
import { VocabTrainerModule } from '../vocab-trainer';

import { ReminderController } from './controllers';
import { ReminderReconciliationService } from './reconciliation/reminder-reconciliation.service';
import { ReminderScheduleRepository } from './repositories/reminder-schedule.repository';
import { SchedulerPollerService } from './scheduler/scheduler-poller.service';
import { FsrsReminderService, ReminderService, VocabTrainerReminderAfterExamService } from './services';
import { ActedCheckRegistry } from './strategies/acted-check.registry';
import { VocabTrainerActedCheckStrategy } from './strategies/vocab-trainer-acted-check.strategy';

@Module({
    imports: [forwardRef(() => EmailModule), forwardRef(() => NotificationModule), forwardRef(() => VocabTrainerModule), forwardRef(() => VocabModule), ConfigModule],
    controllers: [ReminderController],
    providers: [
        ReminderService,
        ReminderScheduleRepository,
        VocabTrainerActedCheckStrategy,
        ActedCheckRegistry,
        VocabTrainerReminderAfterExamService,
        FsrsReminderService,
        SchedulerPollerService,
        ReminderReconciliationService,
    ],
    exports: [ReminderService, ReminderScheduleRepository, VocabTrainerReminderAfterExamService, FsrsReminderService, ActedCheckRegistry],
})
export class ReminderModule {}
