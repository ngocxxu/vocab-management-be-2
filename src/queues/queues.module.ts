import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Global, Module } from '@nestjs/common';
import { EReminderType } from '@/domains/reminder/utils';
import { DEAD_LETTER_QUEUE, WORKLOAD_QUEUE_NAMES } from './constants/queue.constants';
import { DEAD_LETTER_QUEUE_DEFAULT_OPTIONS, QUEUE_CONFIG } from './config/queue.config';
import { JobFailureService } from './dlq/job-failure.service';
import { QueueFailureListener } from './dlq/queue-failure.listener';
import { AudioEvaluationProducer } from './producers/audio-evaluation.producer';
import { EmailReminderProducer } from './producers/email-reminder.producer';
import { FillInBlankEvaluationProducer } from './producers/fill-in-blank-evaluation.producer';
import { MultipleChoiceGenerationProducer } from './producers/multiple-choice-generation.producer';
import { NotificationFcmProducer } from './producers/notification-fcm.producer';
import { NotificationProducer } from './producers/notification.producer';
import { VocabTranslationProducer } from './producers/vocab-translation.producer';

const workloadBullModules = WORKLOAD_QUEUE_NAMES.map((name) =>
    BullModule.registerQueue({
        name,
        // Nest @nestjs/bull types target `bull` JobOptions; runtime uses BullMQ-compatible options.
        defaultJobOptions: QUEUE_CONFIG[name as EReminderType].defaultJobOptions as never,
    }),
);

const workloadBoardModules = WORKLOAD_QUEUE_NAMES.map((name) =>
    BullBoardModule.forFeature({
        name,
        adapter: BullAdapter,
    }),
);

const deadLetterBull = BullModule.registerQueue({
    name: DEAD_LETTER_QUEUE,
    defaultJobOptions: DEAD_LETTER_QUEUE_DEFAULT_OPTIONS as never,
});

const deadLetterBoard = BullBoardModule.forFeature({
    name: DEAD_LETTER_QUEUE,
    adapter: BullAdapter,
});

const producers = [
    AudioEvaluationProducer,
    MultipleChoiceGenerationProducer,
    FillInBlankEvaluationProducer,
    VocabTranslationProducer,
    EmailReminderProducer,
    NotificationProducer,
    NotificationFcmProducer,
];

@Global()
@Module({
    imports: [
        ...workloadBullModules,
        deadLetterBull,
        ...workloadBoardModules,
        deadLetterBoard,
    ],
    providers: [...producers, JobFailureService, QueueFailureListener],
    exports: [BullModule, ...producers],
})
export class QueuesModule {}
