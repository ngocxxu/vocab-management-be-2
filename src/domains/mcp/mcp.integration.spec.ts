import { AuthIdentityService, AuthTokenService, AuthUser, IdentityUnauthorizedException } from '@/auth';
import { LanguageFolderNotFoundException } from '@/domains/catalog/language-folder/exceptions/language-folder-not-found.exception';
import { LanguageFolderService } from '@/domains/catalog/language-folder/services/language-folder.service';
import { PlanQuotaExceededException } from '@/domains/catalog/plan/exceptions/plan-quota-exceeded.exception';
import { SubjectService } from '@/domains/catalog/subject/services/subject.service';
import { WordTypeService } from '@/domains/catalog/word-type/services/word-type.service';
import { VocabFolderLanguageMismatchException } from '@/domains/vocab/exceptions/vocab-folder-language-mismatch.exception';
import { VocabInUseException } from '@/domains/vocab/exceptions/vocab-in-use.exception';
import { VocabNotFoundException } from '@/domains/vocab/exceptions/vocab-not-found.exception';
import { VocabRepository } from '@/domains/vocab/repositories/vocab.repository';
import { VocabService } from '@/domains/vocab/services/vocab.service';
import { LoggerService } from '@/shared/services/logger.service';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { Server } from 'http';
import { AddressInfo } from 'net';

import { MCP_METADATA_PATH } from './constants';
import { McpController } from './controllers';
import { McpAuthGuard, McpEnabledGuard, McpRequestGuard } from './guards';
import { McpServerService, PublicMcpToolRegistry } from './services';

const API_PATH = '/api/v1/';
const MCP_PATH = `${API_PATH}mcp`;
const RESOURCE = `https://api.test${MCP_PATH}`;
const ISSUER = 'https://tenant.auth0.com/';

const vocabRow = {
    id: 'vocab-1',
    textSource: 'hello',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'vi',
    userId: 'owner-1',
    languageFolderId: 'folder-1',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    vocabMasteries: [{ masteryScore: 3 }],
    textTargets: [
        {
            id: 'tt-1',
            vocabId: 'vocab-1',
            textTarget: 'xin chao',
            grammar: 'interjection',
            explanationSource: null,
            explanationTarget: null,
            wordType: { id: 'wt-1', name: 'interjection' },
            vocabExamples: [{ id: 'ex-1', source: 'Hello!', target: 'Xin chao!' }],
            textTargetSubjects: [{ subject: { id: 's-1', name: 'Greetings' } }],
        },
    ],
};

const folderRow = { id: 'folder-1', name: 'English', sourceLanguageCode: 'en', targetLanguageCode: 'vi' };

const authUser = (scopes: string[], subject = 'auth0|u1'): AuthUser => ({
    id: subject,
    email: null,
    roles: [],
    provider: 'auth0',
    issuer: ISSUER,
    subject,
    scopes,
});

const extractText = (result: unknown): string => (result as { content: Array<{ text: string }> }).content[0].text;

/** Scopes each test token carries. `no-scope` has the write scope but not the read scope. */
const TOKEN_SCOPES: Record<string, string[]> = {
    read: ['vocab:read'],
    write: ['vocab:read', 'vocab:write'],
    delete: ['vocab:read', 'vocab:write', 'vocab:delete'],
    'no-scope': ['vocab:write'],
};

const userForToken = (token: string): AuthUser | undefined => {
    if (token === 'stranger') {
        return authUser(['vocab:read'], 'auth0|stranger');
    }
    const scopes: string[] | undefined = TOKEN_SCOPES[token];
    return scopes ? authUser(scopes) : undefined;
};

async function startApp(enabled: boolean) {
    const findWithPagination = jest.fn<Promise<{ totalItems: number; vocabs: unknown[] }>, unknown[]>();
    findWithPagination.mockResolvedValue({ totalItems: 1, vocabs: [vocabRow] });
    const vocabRepository = { findWithPagination };
    const vocabService = {
        create: jest.fn().mockResolvedValue({ id: 'vocab-new', textSource: 'cat' }),
        update: jest.fn().mockResolvedValue({ id: 'vocab-1', textSource: 'hello' }),
        delete: jest.fn().mockResolvedValue({ id: 'vocab-1', textSource: 'hello' }),
    };
    const languageFolderService = {
        findOne: jest.fn().mockResolvedValue(folderRow),
        findByUserId: jest.fn().mockResolvedValue({ items: [folderRow], statusCode: 200 }),
        create: jest.fn().mockResolvedValue({ id: 'folder-2', name: 'Korean', sourceLanguageCode: 'en', targetLanguageCode: 'ko' }),
    };
    const subjectService = {
        find: jest.fn().mockResolvedValue({ items: [{ id: 's-1', name: 'Greetings' }], statusCode: 200 }),
        findByIds: jest.fn().mockResolvedValue([{ id: 's-1', name: 'Greetings' }]),
        upsertByName: jest.fn().mockResolvedValue({ id: 's-2', name: 'Travel' }),
    };
    const wordTypeService = {
        find: jest.fn().mockResolvedValue({ items: [{ id: 'wt-1', name: 'interjection' }], statusCode: 200 }),
    };
    const tokenService = {
        extractBearerToken: (req: { headers: { authorization?: string } }) =>
            req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice('Bearer '.length) : null,
        verifyAccessToken: jest.fn(async (token: string, audience: string) => {
            // The stub is async like the real service; the await keeps the lint rule about async functions satisfied.
            await Promise.resolve();
            const user = audience === RESOURCE ? userForToken(token) : undefined;
            if (!user) {
                throw new UnauthorizedException();
            }
            return user;
        }),
    };
    // Read on every request, so a test can flip it between two calls, as an admin does in the database.
    const access = { enabled: true, role: 'MEMBER' };
    const identityService = {
        // `role` is needed because RolesGuard reads the database role from the bound user, and the MCP guard blocks GUEST.
        resolveLocalUser: jest.fn(async (user: { subject?: string }) => {
            await Promise.resolve();
            if (user.subject === 'auth0|stranger') {
                throw new IdentityUnauthorizedException();
            }
            return { id: 'user-1', isActive: true, role: access.role, mcpAccess: access.enabled };
        }),
    };
    const moduleRef = await Test.createTestingModule({
        imports: [
            ConfigModule.forRoot({
                isGlobal: true,
                ignoreEnvFile: true,
                load: [
                    () => ({
                        mcp: { enabled, resourceUrl: RESOURCE, allowedOrigins: ['https://claude.ai'] },
                        auth0: { issuer: ISSUER },
                        app: { nodeEnv: 'test' },
                    }),
                ],
            }),
        ],
        controllers: [McpController],
        providers: [
            PublicMcpToolRegistry,
            McpServerService,
            McpEnabledGuard,
            McpRequestGuard,
            McpAuthGuard,
            { provide: VocabRepository, useValue: vocabRepository },
            { provide: VocabService, useValue: vocabService },
            { provide: LanguageFolderService, useValue: languageFolderService },
            { provide: SubjectService, useValue: subjectService },
            { provide: WordTypeService, useValue: wordTypeService },
            { provide: LoggerService, useValue: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } },
            { provide: AuthTokenService, useValue: tokenService },
            { provide: AuthIdentityService, useValue: identityService },
        ],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication();
    app.setGlobalPrefix(API_PATH, { exclude: [MCP_METADATA_PATH] });
    await app.init();
    await app.listen(0);
    const server = app.getHttpServer() as Server;
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { app, base, vocabRepository, vocabService, languageFolderService, subjectService, wordTypeService, access };
}

const connect = async (base: string, token: string) => {
    const client = new Client({ name: 'mcp-integration-test', version: '0.0.0' });
    await client.connect(
        new StreamableHTTPClientTransport(new URL(`${base}${MCP_PATH}`), {
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
    );
    return client;
};

interface ToolBody {
    [key: string]: unknown;
    error?: { code: string; message: string; requiredScope?: string };
}

/** Calls one tool over its own connection, so each call starts with the token's scopes. */
const callTool = async (base: string, token: string, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; body: ToolBody }> => {
    const client = await connect(base, token);
    try {
        const result = await client.callTool({ name, arguments: args });
        return { isError: result.isError === true, body: JSON.parse(extractText(result)) as ToolBody };
    } finally {
        await client.close();
    }
};

const postToolsList = async (base: string, token = 'read'): Promise<Response> =>
    fetch(`${base}${MCP_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

describe('Public MCP endpoint', () => {
    describe('when enabled', () => {
        let ctx: Awaited<ReturnType<typeof startApp>>;

        beforeAll(async () => {
            ctx = await startApp(true);
        });

        afterAll(async () => {
            await ctx.app.close();
        });

        it('serves the protected-resource metadata without auth', async () => {
            const res = await fetch(`${ctx.base}/.well-known/oauth-protected-resource`);

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({
                resource: RESOURCE,
                authorization_servers: [ISSUER],
                scopes_supported: ['vocab:read', 'vocab:write', 'vocab:delete'],
                bearer_methods_supported: ['header'],
            });
        });

        it('answers 401 with a challenge when there is no token, a web-audience token, or an unknown identity', async () => {
            for (const authorization of [undefined, 'Bearer web-token', 'Bearer stranger']) {
                const res = await fetch(`${ctx.base}${MCP_PATH}`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        accept: 'application/json, text/event-stream',
                        ...(authorization ? { authorization } : {}),
                    },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
                });

                expect(res.status).toBe(401);
                const challenge = res.headers.get('www-authenticate') ?? '';
                expect(challenge).toContain(`resource_metadata="https://api.test/.well-known/oauth-protected-resource"`);
                if (authorization) {
                    expect(challenge).toContain('error="invalid_token"');
                }
            }
        });

        it('rejects a foreign Origin and answers 405 to GET', async () => {
            const foreign = await fetch(`${ctx.base}${MCP_PATH}`, {
                method: 'POST',
                headers: { origin: 'https://evil.test', authorization: 'Bearer read', 'content-type': 'application/json' },
                body: '{}',
            });
            const get = await fetch(`${ctx.base}${MCP_PATH}`);

            expect(foreign.status).toBe(403);
            expect(get.status).toBe(405);
            expect(get.headers.get('allow')).toBe('POST');
        });

        it('lists the allowlisted tools with their input schemas and annotations', async () => {
            const client = await connect(ctx.base, 'read');

            const { tools } = await client.listTools();
            expect(tools.map((tool) => tool.name)).toEqual([
                'list_vocab',
                'add_vocab',
                'update_vocab',
                'delete_vocab',
                'list_word_types',
                'list_subjects',
                'create_subject',
                'list_folders',
                'create_folder',
            ]);
            expect(tools.every((tool) => (tool.inputSchema as { additionalProperties?: boolean }).additionalProperties === false)).toBe(true);
            expect(tools.find((tool) => tool.name === 'list_vocab')?.annotations).toMatchObject({ readOnlyHint: true });
            expect(tools.find((tool) => tool.name === 'delete_vocab')?.annotations).toMatchObject({ destructiveHint: true });

            await client.close();
        });

        it('returns scoped vocab with the vocab id and no other internal ids', async () => {
            const client = await connect(ctx.base, 'read');

            const result = await client.callTool({ name: 'list_vocab', arguments: { query: 'hel', limit: 5 } });
            const text = extractText(result);
            expect(result.isError).toBeFalsy();
            expect(JSON.parse(text).items[0]).toMatchObject({ id: 'vocab-1', textSource: 'hello', masteryScore: 3, sourceLanguageCode: 'en' });
            expect(text).not.toMatch(/owner-1|folder-1|tt-1|ex-1|wt-1|s-1/);
            expect(ctx.vocabRepository.findWithPagination).toHaveBeenLastCalledWith(expect.objectContaining({ textSource: 'hel' }), 'user-1', 0, 5);

            await client.close();
        });

        it('returns insufficient_scope when the token lacks vocab:read', async () => {
            const client = await connect(ctx.base, 'no-scope');

            const result = await client.callTool({ name: 'list_vocab', arguments: {} });

            expect(result.isError).toBe(true);
            expect(JSON.parse(extractText(result)).error).toMatchObject({ code: 'insufficient_scope', requiredScope: 'vocab:read' });
            await client.close();
        });

        it('returns invalid_params for unknown keys and unknown_tool for tools outside the allowlist', async () => {
            const client = await connect(ctx.base, 'read');

            const extraKey = await client.callTool({ name: 'list_vocab', arguments: { foo: 1 } });
            const unknown = await client.callTool({ name: 'get_vocab_detail', arguments: {} });

            expect(JSON.parse(extractText(extraKey)).error.code).toBe('invalid_params');
            expect(JSON.parse(extractText(unknown)).error.code).toBe('unknown_tool');
            await client.close();
        });

        it('returns internal_error without database details when a tool throws', async () => {
            ctx.vocabRepository.findWithPagination.mockRejectedValueOnce(new Error('PrismaClientKnownRequestError: secret table detail'));
            const client = await connect(ctx.base, 'read');

            const result = await client.callTool({ name: 'list_vocab', arguments: {} });

            expect(result.isError).toBe(true);
            expect(JSON.parse(extractText(result)).error.code).toBe('internal_error');
            expect(extractText(result)).not.toMatch(/Prisma|secret|table/);
            await client.close();
        });

        it('returns 403 for a valid token when the user has MCP access off', async () => {
            ctx.access.enabled = false;
            try {
                const res = await fetch(`${ctx.base}${MCP_PATH}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer read' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
                });

                expect(res.status).toBe(403);
            } finally {
                ctx.access.enabled = true;
            }
        });

        it('blocks the next request after MCP access is turned off mid-session', async () => {
            const client = await connect(ctx.base, 'read');
            try {
                const before = await client.listTools();
                expect(before.tools.map((tool) => tool.name)).toContain('list_vocab');

                ctx.access.enabled = false;
                await expect(client.listTools()).rejects.toThrow();
            } finally {
                ctx.access.enabled = true;
                await client.close();
            }
        });

        it('returns 403 mcp_requires_plan for a GUEST, even when the user has MCP access on', async () => {
            ctx.access.role = 'GUEST';
            try {
                const res = await postToolsList(ctx.base);

                expect(res.status).toBe(403);
                expect(JSON.stringify(await res.json())).toContain('mcp_requires_plan');
            } finally {
                ctx.access.role = 'MEMBER';
            }
        });

        it('keeps mcp_access_disabled for a MEMBER whose access is switched off', async () => {
            ctx.access.enabled = false;
            try {
                const res = await postToolsList(ctx.base);

                expect(res.status).toBe(403);
                expect(JSON.stringify(await res.json())).toContain('mcp_access_disabled');
            } finally {
                ctx.access.enabled = true;
            }
        });

        it('lets an ADMIN use MCP', async () => {
            ctx.access.role = 'ADMIN';
            try {
                const res = await postToolsList(ctx.base);

                expect(res.status).toBe(200);
            } finally {
                ctx.access.role = 'MEMBER';
            }
        });

        describe('write and delete tools', () => {
            const meaning = { text: 'mèo', wordTypeId: 'wt-1', grammar: 'noun', subjectIds: ['s-1'], examples: [{ source: 'A cat', target: 'Con mèo' }] };
            const addArgs = { textSource: 'cat', folderId: 'folder-1', meanings: [meaning] };
            const updateArgs = { id: 'vocab-1', textSource: 'hello', folderId: 'folder-2', meanings: [{ text: 'xin chào', subjectIds: ['s-1'] }] };

            beforeEach(() => {
                jest.clearAllMocks();
            });

            it.each([
                ['add_vocab', 'vocab:write'],
                ['update_vocab', 'vocab:write'],
                ['create_subject', 'vocab:write'],
                ['create_folder', 'vocab:write'],
                ['delete_vocab', 'vocab:delete'],
            ])('returns insufficient_scope for %s with a read-only token', async (name, requiredScope) => {
                const result = await callTool(ctx.base, 'read', name, {});

                expect(result.isError).toBe(true);
                expect(result.body.error).toMatchObject({ code: 'insufficient_scope', requiredScope });
            });

            it('returns insufficient_scope for delete_vocab with a write token and runs nothing', async () => {
                const result = await callTool(ctx.base, 'write', 'delete_vocab', { id: 'vocab-1' });

                expect(result.body.error).toMatchObject({ code: 'insufficient_scope', requiredScope: 'vocab:delete' });
                expect(ctx.vocabService.delete).not.toHaveBeenCalled();
            });

            it('add_vocab saves the word with the folder language pair and the subject ids', async () => {
                const result = await callTool(ctx.base, 'write', 'add_vocab', addArgs);

                expect(result.isError).toBe(false);
                expect(result.body).toEqual({ id: 'vocab-new', textSource: 'cat' });
                expect(ctx.vocabService.create).toHaveBeenLastCalledWith(
                    expect.objectContaining({
                        textSource: 'cat',
                        sourceLanguageCode: 'en',
                        targetLanguageCode: 'vi',
                        languageFolderId: 'folder-1',
                        textTargets: [
                            expect.objectContaining({
                                textTarget: 'mèo',
                                wordTypeId: 'wt-1',
                                grammar: 'noun',
                                subjects: [{ id: 's-1' }],
                                vocabExamples: [{ source: 'A cat', target: 'Con mèo' }],
                            }),
                        ],
                    }),
                    'user-1',
                    'MEMBER',
                );
            });

            it('add_vocab returns folder_not_found for a folder the user does not own', async () => {
                ctx.languageFolderService.findOne.mockRejectedValueOnce(new LanguageFolderNotFoundException('folder-x'));

                const result = await callTool(ctx.base, 'write', 'add_vocab', addArgs);

                expect(result.body.error?.code).toBe('folder_not_found');
                expect(ctx.vocabService.create).not.toHaveBeenCalled();
            });

            it("add_vocab returns subject_not_found when a subject id is not the user's", async () => {
                ctx.subjectService.findByIds.mockResolvedValueOnce([]);

                const result = await callTool(ctx.base, 'write', 'add_vocab', addArgs);

                expect(result.body.error?.code).toBe('subject_not_found');
                expect(ctx.vocabService.create).not.toHaveBeenCalled();
            });

            it('add_vocab returns word_type_not_found for an unknown word type id', async () => {
                ctx.wordTypeService.find.mockResolvedValueOnce({ items: [], statusCode: 200 });

                const result = await callTool(ctx.base, 'write', 'add_vocab', addArgs);

                expect(result.body.error?.code).toBe('word_type_not_found');
                expect(ctx.vocabService.create).not.toHaveBeenCalled();
            });

            it('add_vocab returns duplicate_vocab when the database refuses the unique key', async () => {
                ctx.vocabService.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.11.1' }));

                const result = await callTool(ctx.base, 'write', 'add_vocab', addArgs);

                expect(result.body.error?.code).toBe('duplicate_vocab');
            });

            it('add_vocab returns quota_exceeded when the plan limit is reached', async () => {
                ctx.vocabService.create.mockRejectedValueOnce(new PlanQuotaExceededException('Daily vocab limit reached'));

                const result = await callTool(ctx.base, 'write', 'add_vocab', addArgs);

                expect(result.body.error).toMatchObject({ code: 'quota_exceeded', message: 'Daily vocab limit reached' });
            });

            it.each([
                ['no meanings', { ...addArgs, meanings: [] }],
                ['two meanings with the same text', { ...addArgs, meanings: [meaning, { ...meaning, text: 'MÈO' }] }],
                ['a meaning without subjects', { ...addArgs, meanings: [{ ...meaning, subjectIds: [] }] }],
                ['a meaning that lists one subject twice', { ...addArgs, meanings: [{ ...meaning, subjectIds: ['s-1', 's-1'] }] }],
            ])('add_vocab returns invalid_params for %s and saves nothing', async (_label, args) => {
                const result = await callTool(ctx.base, 'write', 'add_vocab', args);

                expect(result.body.error?.code).toBe('invalid_params');
                expect(ctx.vocabService.create).not.toHaveBeenCalled();
            });

            it('update_vocab replaces the meanings and moves the word to a folder', async () => {
                const result = await callTool(ctx.base, 'write', 'update_vocab', updateArgs);

                expect(result.body).toEqual({ id: 'vocab-1', textSource: 'hello' });
                expect(ctx.vocabService.update).toHaveBeenLastCalledWith(
                    'vocab-1',
                    expect.objectContaining({
                        textSource: 'hello',
                        languageFolderId: 'folder-2',
                        textTargets: [expect.objectContaining({ textTarget: 'xin chào', subjectIds: ['s-1'] })],
                    }),
                    'user-1',
                    'MEMBER',
                );
            });

            it('update_vocab returns folder_language_mismatch for a folder with another language pair', async () => {
                ctx.vocabService.update.mockRejectedValueOnce(new VocabFolderLanguageMismatchException());

                const result = await callTool(ctx.base, 'write', 'update_vocab', updateArgs);

                expect(result.body.error?.code).toBe('folder_language_mismatch');
            });

            it('update_vocab returns vocab_not_found for a word the user does not own', async () => {
                ctx.vocabService.update.mockRejectedValueOnce(new VocabNotFoundException('vocab-1'));

                const result = await callTool(ctx.base, 'write', 'update_vocab', updateArgs);

                expect(result.body.error?.code).toBe('vocab_not_found');
            });

            it('update_vocab returns invalid_params for a meaning that lists one subject twice', async () => {
                const result = await callTool(ctx.base, 'write', 'update_vocab', { ...updateArgs, meanings: [{ text: 'xin chào', subjectIds: ['s-1', 's-1'] }] });

                expect(result.body.error?.code).toBe('invalid_params');
                expect(ctx.vocabService.update).not.toHaveBeenCalled();
            });

            it('delete_vocab deletes the word for a delete token', async () => {
                const result = await callTool(ctx.base, 'delete', 'delete_vocab', { id: 'vocab-1' });

                expect(result.body).toEqual({ id: 'vocab-1', textSource: 'hello', deleted: true });
                expect(ctx.vocabService.delete).toHaveBeenLastCalledWith('vocab-1', 'user-1');
            });

            it('delete_vocab returns vocab_in_use and names the trainer that holds the word', async () => {
                ctx.vocabService.delete.mockRejectedValueOnce(
                    new VocabInUseException([{ vocabId: 'vocab-1', textSource: 'hello', trainerCount: 1, sampleTrainers: [{ id: 't1', name: 'Exam words' }] }]),
                );

                const result = await callTool(ctx.base, 'delete', 'delete_vocab', { id: 'vocab-1' });

                expect(result.body.error?.code).toBe('vocab_in_use');
                expect(result.body.error?.message).toContain('Exam words');
            });

            it('list_word_types, list_subjects and list_folders return the user-visible items', async () => {
                const wordTypes = await callTool(ctx.base, 'read', 'list_word_types', {});
                const subjects = await callTool(ctx.base, 'read', 'list_subjects', {});
                const folders = await callTool(ctx.base, 'read', 'list_folders', {});

                expect(wordTypes.body.items).toEqual([{ id: 'wt-1', name: 'interjection' }]);
                expect(subjects.body.items).toEqual([{ id: 's-1', name: 'Greetings' }]);
                expect(folders.body.items).toEqual([{ id: 'folder-1', name: 'English', sourceLanguageCode: 'en', targetLanguageCode: 'vi' }]);
            });

            it('create_subject returns the subject for the name, reusing an existing one', async () => {
                const result = await callTool(ctx.base, 'write', 'create_subject', { name: 'Travel' });

                expect(result.body).toEqual({ id: 's-2', name: 'Travel' });
                expect(ctx.subjectService.upsertByName).toHaveBeenLastCalledWith(expect.any(String), 'user-1', 'MEMBER');
            });

            it('create_folder creates a folder for a new name and language pair', async () => {
                const result = await callTool(ctx.base, 'write', 'create_folder', { name: 'Korean', sourceLanguageCode: 'en', targetLanguageCode: 'ko' });

                expect(result.isError).toBe(false);
                expect(ctx.languageFolderService.create).toHaveBeenLastCalledWith(
                    expect.objectContaining({ name: 'Korean', sourceLanguageCode: 'en', targetLanguageCode: 'ko' }),
                    'user-1',
                    'MEMBER',
                );
            });

            it('create_folder returns duplicate_folder for the same name in any case and the same pair', async () => {
                const result = await callTool(ctx.base, 'write', 'create_folder', { name: 'english', sourceLanguageCode: 'en', targetLanguageCode: 'vi' });

                expect(result.body.error?.code).toBe('duplicate_folder');
                expect(ctx.languageFolderService.create).not.toHaveBeenCalled();
            });

            it('create_folder returns invalid_params when source and target language are the same', async () => {
                const result = await callTool(ctx.base, 'write', 'create_folder', { name: 'Loop', sourceLanguageCode: 'en', targetLanguageCode: 'en' });

                expect(result.body.error?.code).toBe('invalid_params');
                expect(ctx.languageFolderService.create).not.toHaveBeenCalled();
            });
        });
    });

    describe('when disabled', () => {
        it('answers 404 on both routes', async () => {
            const off = await startApp(false);

            const metadata = await fetch(`${off.base}/.well-known/oauth-protected-resource`);
            const endpoint = await fetch(`${off.base}${MCP_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

            expect(metadata.status).toBe(404);
            expect(endpoint.status).toBe(404);
            await off.app.close();
        });
    });
});
