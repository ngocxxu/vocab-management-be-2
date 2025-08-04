import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { TrainerStatus } from '@prisma/client';

@Injectable()
export class VocabTrainerPipe implements PipeTransform {
    transform(value: any) {
        if (value.status) {
            const statuses = Array.isArray(value.status) ? value.status : [value.status];
            const validStatuses = Object.values(TrainerStatus);

            for (const status of statuses) {
                if (!validStatuses.includes(status)) {
                    throw new BadRequestException(
                        `Invalid status: ${status}. Valid statuses are: ${validStatuses.join(
                            ', ',
                        )}`,
                    );
                }
            }
        }
        return value;
    }
}
