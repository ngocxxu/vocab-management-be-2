import { LanguageFolderService } from '@/domains/catalog/language-folder/services/language-folder.service';
import { SubjectService } from '@/domains/catalog/subject/services/subject.service';
import { WordTypeService } from '@/domains/catalog/word-type/services/word-type.service';
import { VocabRepository } from '@/domains/vocab/repositories/vocab.repository';
import { VocabService } from '@/domains/vocab/services/vocab.service';
import { Injectable } from '@nestjs/common';

import { PublicVocabMapper } from '../mappers';
import {
    createAddVocabTool,
    createCreateFolderTool,
    createCreateSubjectTool,
    createDeleteVocabTool,
    createListFoldersTool,
    createListSubjectsTool,
    createListVocabTool,
    createListWordTypesTool,
    createUpdateVocabTool,
    PublicMcpTool,
} from '../tools';

/** The public tool allowlist. A tool is discoverable and callable over MCP only when it is listed here. */
@Injectable()
export class PublicMcpToolRegistry {
    private readonly tools: readonly PublicMcpTool[];

    public constructor(
        vocabRepository: VocabRepository,
        vocabService: VocabService,
        languageFolderService: LanguageFolderService,
        subjectService: SubjectService,
        wordTypeService: WordTypeService,
    ) {
        this.tools = [
            createListVocabTool(vocabRepository, new PublicVocabMapper()),
            createAddVocabTool(vocabService, languageFolderService, subjectService, wordTypeService),
            createUpdateVocabTool(vocabService, subjectService, wordTypeService),
            createDeleteVocabTool(vocabService),
            createListWordTypesTool(wordTypeService),
            createListSubjectsTool(subjectService),
            createCreateSubjectTool(subjectService),
            createListFoldersTool(languageFolderService),
            createCreateFolderTool(languageFolderService),
        ];
    }

    public list(): readonly PublicMcpTool[] {
        return this.tools;
    }

    public get(name: string): PublicMcpTool | undefined {
        return this.tools.find((tool) => tool.name === name);
    }
}
