import { ConflictException } from '@nestjs/common';

export class SubjectInUseException extends ConflictException {
    public constructor(subjectId: string, subjectName: string, affectedVocabCount: number, sampleVocabIds: string[] = []) {
        super({
            message: `Cannot delete subject. ${affectedVocabCount} vocabs are using it.`,
            error: 'SubjectInUse',
            details: {
                subjectId,
                subjectName,
                affectedVocabCount,
                sampleVocabIds,
            },
        });
    }
}
