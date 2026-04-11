import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { TrainerStatus } from '@prisma/client';

interface VocabTrainerQueryInput {
    status?: string | string[] | TrainerStatus | TrainerStatus[];
    [key: string]: unknown;
}

@Injectable()
export class VocabTrainerPipe implements PipeTransform<unknown, VocabTrainerQueryInput> {
    public transform(value: unknown): VocabTrainerQueryInput {
        if (!value || typeof value !== 'object') {
            return value as VocabTrainerQueryInput;
        }

        const input = value as VocabTrainerQueryInput;

        if (input.status) {
            const statuses = Array.isArray(input.status) ? input.status : [input.status];
            const validStatuses = Object.values(TrainerStatus);

            for (const status of statuses) {
                if (typeof status !== 'string' || !validStatuses.includes(status as TrainerStatus)) {
                    throw new BadRequestException(
                        `Invalid status: ${status}. Valid statuses are: ${validStatuses.join(', ')}`,
                    );
                }
            }
        }

        return input;
    }
}
