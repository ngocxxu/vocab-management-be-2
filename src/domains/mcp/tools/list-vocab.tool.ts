import { VocabQueryParamsInput } from '@/domains/vocab/dto/vocab-query-params.input';
import { VocabRepository } from '@/domains/vocab/repositories/vocab.repository';
import { z } from 'zod';

import { MCP_MAX_RESPONSE_BYTES, MCP_SCOPES } from '../constants';
import { PublicVocabMapper } from '../mappers';
import { capItemsToBytes } from '../utils';
import { definePublicTool, PublicMcpTool } from './public-mcp-tool';

const LIST_VOCAB_DEFAULT_LIMIT = 10;
const LIST_VOCAB_MAX_LIMIT = 20;
const LIST_VOCAB_MAX_QUERY_LENGTH = 100;

const listVocabInput = z.strictObject({
    query: z.string().trim().min(1).max(LIST_VOCAB_MAX_QUERY_LENGTH).optional().describe('Text to look for in the source word or phrase'),
    limit: z.number().int().min(1).max(LIST_VOCAB_MAX_LIMIT).default(LIST_VOCAB_DEFAULT_LIMIT).describe('Maximum number of items to return'),
});

/** `list_vocab`: the signed-in user's vocabulary, newest first. Reads only; needs `vocab:read`. */
export function createListVocabTool(vocabRepository: VocabRepository, mapper: PublicVocabMapper): PublicMcpTool {
    return definePublicTool({
        name: 'list_vocab',
        description: "List the signed-in user's vocabulary, newest first. Optionally filter by text in the source word or phrase.",
        requiredScope: MCP_SCOPES.READ,
        inputSchema: listVocabInput,
        execute: async ({ query, limit }, { userId }) => {
            // The repository scopes the query by userId, so one caller never sees another caller's vocabulary.
            const params = Object.assign(new VocabQueryParamsInput(), query ? { textSource: query } : {});
            const { totalItems, vocabs } = await vocabRepository.findWithPagination(params, userId, 0, limit);
            const { items, truncated } = capItemsToBytes(mapper.toPublicList(vocabs), MCP_MAX_RESPONSE_BYTES);
            return { total: totalItems, returned: items.length, truncated, items };
        },
    });
}
