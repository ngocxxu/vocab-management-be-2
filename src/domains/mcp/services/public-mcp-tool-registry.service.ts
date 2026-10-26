import { VocabRepository } from '@/domains/vocab/repositories/vocab.repository';
import { Injectable } from '@nestjs/common';

import { PublicVocabMapper } from '../mappers';
import { createListVocabTool, PublicMcpTool } from '../tools';

/** The public tool allowlist. A tool is discoverable and callable over MCP only when it is listed here. */
@Injectable()
export class PublicMcpToolRegistry {
    private readonly tools: readonly PublicMcpTool[];

    public constructor(vocabRepository: VocabRepository) {
        this.tools = [createListVocabTool(vocabRepository, new PublicVocabMapper())];
    }

    public list(): readonly PublicMcpTool[] {
        return this.tools;
    }

    public get(name: string): PublicMcpTool | undefined {
        return this.tools.find((tool) => tool.name === name);
    }
}
