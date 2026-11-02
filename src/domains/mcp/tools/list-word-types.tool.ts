import { WordTypeService } from '@/domains/catalog/word-type/services/word-type.service';
import { z } from 'zod';

import { MCP_SCOPES } from '../constants';
import { definePublicTool, PublicMcpTool } from './public-mcp-tool';

/** `list_word_types`: the word types a meaning can use. Reads only; needs `vocab:read`. */
export function createListWordTypesTool(wordTypeService: WordTypeService): PublicMcpTool {
    return definePublicTool({
        name: 'list_word_types',
        description: 'List the word types, for example noun or verb. Use their ids as wordTypeId in add_vocab and update_vocab.',
        requiredScope: MCP_SCOPES.READ,
        annotations: { readOnlyHint: true },
        inputSchema: z.strictObject({}),
        execute: async () => {
            const { items } = await wordTypeService.find();
            return { items: items.map(({ id, name }) => ({ id, name })) };
        },
    });
}
