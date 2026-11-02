import { LanguageFolderService } from '@/domains/catalog/language-folder/services/language-folder.service';
import { SubjectService } from '@/domains/catalog/subject/services/subject.service';
import { WordTypeService } from '@/domains/catalog/word-type/services/word-type.service';
import { VocabService } from '@/domains/vocab/services/vocab.service';

import { MCP_SCOPES } from '../constants';
import { withDuplicateVocabCheck } from '../utils/domain-error.util';
import { definePublicTool, PublicMcpTool } from './public-mcp-tool';
import { assertMeaningRefs } from './vocab-meaning-refs';
import { addVocabInput } from './vocab-payload.schema';

/** `add_vocab`: a new word with all its meanings. The folder sets the language pair; the client never sends codes. Needs `vocab:write`. */
export function createAddVocabTool(
    vocabService: VocabService,
    languageFolderService: LanguageFolderService,
    subjectService: SubjectService,
    wordTypeService: WordTypeService,
): PublicMcpTool {
    return definePublicTool({
        name: 'add_vocab',
        description:
            'Add a word with all its meanings to a language folder. The folder sets the language pair. ' +
            'Each meaning needs at least one subject id. If the user did not say which folder or subjects to use, ' +
            'call list_folders or list_subjects and ask the user. Never guess ids.',
        requiredScope: MCP_SCOPES.WRITE,
        inputSchema: addVocabInput,
        execute: async (input, { userId, role }) => {
            const folder = await languageFolderService.findOne(input.folderId, userId);
            await assertMeaningRefs(input.meanings, userId, subjectService, wordTypeService);

            const created = await withDuplicateVocabCheck(
                vocabService.create(
                    {
                        textSource: input.textSource,
                        sourceLanguageCode: folder.sourceLanguageCode,
                        targetLanguageCode: folder.targetLanguageCode,
                        languageFolderId: folder.id,
                        textTargets: input.meanings.map((meaning) => ({
                            textTarget: meaning.text,
                            wordTypeId: meaning.wordTypeId,
                            grammar: meaning.grammar,
                            explanationSource: meaning.explanationSource,
                            explanationTarget: meaning.explanationTarget,
                            subjects: meaning.subjectIds.map((id) => ({ id })),
                            vocabExamples: meaning.examples,
                        })),
                    },
                    userId,
                    role,
                ),
            );
            return { id: created.id, textSource: created.textSource };
        },
    });
}
