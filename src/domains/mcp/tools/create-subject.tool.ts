import { SubjectService } from '@/domains/catalog/subject/services/subject.service';
import { normalizeSubjectName } from '@/domains/catalog/subject/utils';
import { z } from 'zod';

import { MCP_SCOPES, MCP_WRITE_LIMITS } from '../constants';
import { definePublicTool, PublicMcpTool } from './public-mcp-tool';

/** `create_subject`: a subject by name. Idempotent: an existing name returns the existing subject. Needs `vocab:write`. */
export function createCreateSubjectTool(subjectService: SubjectService): PublicMcpTool {
    return definePublicTool({
        name: 'create_subject',
        description: 'Create a subject by name, or get the existing one with the same name. Call list_subjects first when you are not sure it exists.',
        requiredScope: MCP_SCOPES.WRITE,
        inputSchema: z.strictObject({
            name: z.string().trim().min(1).max(MCP_WRITE_LIMITS.SUBJECT_NAME).describe('Subject name, e.g. "Travel"'),
        }),
        execute: async ({ name }, { userId, role }) => {
            const subject = await subjectService.upsertByName(normalizeSubjectName(name), userId, role);
            return { id: subject.id, name: subject.name };
        },
    });
}
