import { LanguageFolderService } from '@/domains/catalog/language-folder/services/language-folder.service';
import { z } from 'zod';

import { MCP_SCOPES } from '../constants';
import { definePublicTool, PublicMcpTool } from './public-mcp-tool';

/** `list_folders`: the signed-in user's language folders with their language pairs. Reads only; needs `vocab:read`. */
export function createListFoldersTool(languageFolderService: LanguageFolderService): PublicMcpTool {
    return definePublicTool({
        name: 'list_folders',
        description: "List the user's language folders with their language pairs. Use their ids as folderId in add_vocab and update_vocab.",
        requiredScope: MCP_SCOPES.READ,
        annotations: { readOnlyHint: true },
        inputSchema: z.strictObject({}),
        execute: async (_input, { userId }) => {
            const { items } = await languageFolderService.findByUserId(userId);
            return { items: items.map(({ id, name, sourceLanguageCode, targetLanguageCode }) => ({ id, name, sourceLanguageCode, targetLanguageCode })) };
        },
    });
}
