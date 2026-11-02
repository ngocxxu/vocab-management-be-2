import { VocabService } from '@/domains/vocab/services/vocab.service';
import { z } from 'zod';

import { MCP_SCOPES } from '../constants';
import { definePublicTool, PublicMcpTool } from './public-mcp-tool';

/** `delete_vocab`: removes one word. Refused while a trainer still uses it; never forced. Needs `vocab:delete`. */
export function createDeleteVocabTool(vocabService: VocabService): PublicMcpTool {
    return definePublicTool({
        name: 'delete_vocab',
        description:
            'Delete one word and its meanings. This cannot be undone. ' +
            'A word that a trainer still uses is refused; the user must remove it from that trainer first. Get the id from list_vocab.',
        requiredScope: MCP_SCOPES.DELETE,
        annotations: { destructiveHint: true },
        inputSchema: z.strictObject({ id: z.string().min(1).describe('Vocab id from list_vocab') }),
        execute: async ({ id }, { userId }) => {
            const deleted = await vocabService.delete(id, userId);
            return { id: deleted.id, textSource: deleted.textSource, deleted: true };
        },
    });
}
