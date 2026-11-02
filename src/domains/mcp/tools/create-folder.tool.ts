import { LanguageFolderService } from '@/domains/catalog/language-folder/services/language-folder.service';
import { z } from 'zod';

import { MCP_DEFAULT_FOLDER_COLOR, MCP_ERROR_CODES, MCP_SCOPES, MCP_WRITE_LIMITS } from '../constants';
import { McpToolException } from '../exceptions';
import { definePublicTool, PublicMcpTool } from './public-mcp-tool';

const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?$/;

const createFolderInput = z
    .strictObject({
        name: z.string().trim().min(1).max(MCP_WRITE_LIMITS.FOLDER_NAME).describe('Folder name, e.g. "Business English"'),
        sourceLanguageCode: z.string().regex(LANGUAGE_CODE_PATTERN).describe('Source language code, e.g. "en"'),
        targetLanguageCode: z.string().regex(LANGUAGE_CODE_PATTERN).describe('Target language code, e.g. "vi"'),
    })
    .refine((input) => input.sourceLanguageCode !== input.targetLanguageCode, {
        message: 'Source and target language must be different.',
        path: ['targetLanguageCode'],
    });

/** `create_folder`: a language folder for one language pair. A second folder with the same name and pair is refused. Needs `vocab:write`. */
export function createCreateFolderTool(languageFolderService: LanguageFolderService): PublicMcpTool {
    return definePublicTool({
        name: 'create_folder',
        description: 'Create a language folder for one language pair. Call list_folders first and reuse a folder that already fits.',
        requiredScope: MCP_SCOPES.WRITE,
        inputSchema: createFolderInput,
        execute: async ({ name, sourceLanguageCode, targetLanguageCode }, { userId, role }) => {
            const { items } = await languageFolderService.findByUserId(userId);
            const isSameFolder = (existing: { name: string; sourceLanguageCode: string; targetLanguageCode: string }) =>
                existing.name.toLowerCase() === name.toLowerCase() && existing.sourceLanguageCode === sourceLanguageCode && existing.targetLanguageCode === targetLanguageCode;
            if (items.some(isSameFolder)) {
                throw new McpToolException(MCP_ERROR_CODES.DUPLICATE_FOLDER, 'A folder with this name and language pair already exists. Call list_folders and use it.');
            }

            const folder = await languageFolderService.create({ name, folderColor: MCP_DEFAULT_FOLDER_COLOR, sourceLanguageCode, targetLanguageCode }, userId, role);
            return { id: folder.id, name: folder.name, sourceLanguageCode: folder.sourceLanguageCode, targetLanguageCode: folder.targetLanguageCode };
        },
    });
}
