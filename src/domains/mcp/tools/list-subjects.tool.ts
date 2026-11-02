import { SubjectService } from '@/domains/catalog/subject/services/subject.service';
import { z } from 'zod';

import { MCP_SCOPES } from '../constants';
import { definePublicTool, PublicMcpTool } from './public-mcp-tool';

/** `list_subjects`: the signed-in user's subjects. Reads only; needs `vocab:read`. */
export function createListSubjectsTool(subjectService: SubjectService): PublicMcpTool {
    return definePublicTool({
        name: 'list_subjects',
        description: "List the user's subjects. Use their ids as subjectIds in add_vocab and update_vocab. Use create_subject for a missing subject.",
        requiredScope: MCP_SCOPES.READ,
        annotations: { readOnlyHint: true },
        inputSchema: z.strictObject({}),
        execute: async (_input, { userId }) => {
            const { items } = await subjectService.find(userId);
            return { items: items.map(({ id, name }) => ({ id, name })) };
        },
    });
}
