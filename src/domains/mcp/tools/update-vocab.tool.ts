import { SubjectService } from '@/domains/catalog/subject/services/subject.service';
import { WordTypeService } from '@/domains/catalog/word-type/services/word-type.service';
import { VocabService } from '@/domains/vocab/services/vocab.service';

import { MCP_SCOPES } from '../constants';
import { withDuplicateVocabCheck } from '../utils/domain-error.util';
import { definePublicTool, PublicMcpTool } from './public-mcp-tool';
import { assertMeaningRefs } from './vocab-meaning-refs';
import { updateVocabInput } from './vocab-payload.schema';

/** `update_vocab`: replaces a word and all its meanings. The folder can change only within the same language pair. Needs `vocab:write`. */
export function createUpdateVocabTool(vocabService: VocabService, subjectService: SubjectService, wordTypeService: WordTypeService): PublicMcpTool {
    return definePublicTool({
        name: 'update_vocab',
        description:
            'Replace a word and all its meanings. Send the full payload: every meaning with its subjects. ' +
            'folderId can only move the word to a folder with the same language pair. ' +
            'Get ids from list_vocab, list_folders and list_subjects. Never guess ids.',
        requiredScope: MCP_SCOPES.WRITE,
        inputSchema: updateVocabInput,
        execute: async ({ id, textSource, folderId, meanings }, { userId, role }) => {
            await assertMeaningRefs(meanings, userId, subjectService, wordTypeService);

            const updated = await withDuplicateVocabCheck(
                vocabService.update(
                    id,
                    {
                        textSource,
                        languageFolderId: folderId,
                        textTargets: meanings.map((meaning) => ({
                            textTarget: meaning.text,
                            wordTypeId: meaning.wordTypeId,
                            grammar: meaning.grammar,
                            explanationSource: meaning.explanationSource,
                            explanationTarget: meaning.explanationTarget,
                            subjectIds: meaning.subjectIds,
                            vocabExamples: meaning.examples,
                        })),
                    },
                    userId,
                    role,
                ),
            );
            return { id: updated.id, textSource: updated.textSource };
        },
    });
}
