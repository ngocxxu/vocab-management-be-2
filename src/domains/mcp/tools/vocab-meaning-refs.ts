import { SubjectService } from '@/domains/catalog/subject/services/subject.service';
import { WordTypeService } from '@/domains/catalog/word-type/services/word-type.service';

import { MCP_ERROR_CODES } from '../constants';
import { McpToolException } from '../exceptions';
import { VocabMeaningInput } from './vocab-payload.schema';

/** Refuses subject or word type ids that are not the caller's, or do not exist. Runs before any write, so a bad id saves nothing. */
export async function assertMeaningRefs(meanings: readonly VocabMeaningInput[], userId: string, subjectService: SubjectService, wordTypeService: WordTypeService): Promise<void> {
    const subjectIds = [...new Set(meanings.flatMap((meaning) => meaning.subjectIds))];
    const subjects = await subjectService.findByIds(subjectIds, userId);
    if (subjects.length !== subjectIds.length) {
        throw new McpToolException(MCP_ERROR_CODES.SUBJECT_NOT_FOUND, 'One or more subject ids are not yours. Call list_subjects to get valid ids.');
    }

    const wordTypeIds = meanings.flatMap((meaning) => (meaning.wordTypeId ? [meaning.wordTypeId] : []));
    if (wordTypeIds.length === 0) {
        return;
    }
    const { items } = await wordTypeService.find();
    const known = new Set(items.map((wordType) => wordType.id));
    if (wordTypeIds.some((id) => !known.has(id))) {
        throw new McpToolException(MCP_ERROR_CODES.WORD_TYPE_NOT_FOUND, 'Unknown word type id. Call list_word_types to get valid ids.');
    }
}
