import { NotFoundException } from '@nestjs/common';

export class VocabTrainerNotFoundException extends NotFoundException {
    public constructor(id: string) {
        super(`VocabTrainer with ID ${id} not found`);
    }
}
