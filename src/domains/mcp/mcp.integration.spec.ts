import { AuthIdentityService, AuthTokenService, AuthUser, IdentityUnauthorizedException } from '@/auth';
import { VocabRepository } from '@/domains/vocab/repositories/vocab.repository';
import { LoggerService } from '@/shared/services/logger.service';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
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

const userForToken = (token: string): AuthUser | undefined => {
    if (token === 'read') {
        return authUser(['vocab:read']);
    }
    if (token === 'no-scope') {
        return authUser(['vocab:write']);
    }
    if (token === 'stranger') {
        return authUser(['vocab:read'], 'auth0|stranger');
    }
    return undefined;
};

async function startApp(enabled: boolean) {
    const findWithPagination = jest.fn<Promise<{ totalItems: number; vocabs: unknown[] }>, unknown[]>();
    findWithPagination.mockResolvedValue({ totalItems: 1, vocabs: [vocabRow] });
    const vocabRepository = { findWithPagination };
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
    return { app, base, vocabRepository, access };
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
                scopes_supported: ['vocab:read', 'vocab:write'],
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

        it('lists only the allowlisted tool and returns scoped vocab with no internal ids', async () => {
            const client = await connect(ctx.base, 'read');

            const { tools } = await client.listTools();
            expect(tools.map((tool) => tool.name)).toEqual(['list_vocab']);
            expect((tools[0].inputSchema as { additionalProperties?: boolean }).additionalProperties).toBe(false);

            const result = await client.callTool({ name: 'list_vocab', arguments: { query: 'hel', limit: 5 } });
            const text = extractText(result);
            expect(result.isError).toBeFalsy();
            expect(JSON.parse(text).items[0]).toMatchObject({ textSource: 'hello', masteryScore: 3, sourceLanguageCode: 'en' });
            expect(text).not.toMatch(/"id"|owner-1|folder-1|tt-1|ex-1|wt-1|s-1/);
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
                expect(before.tools.map((tool) => tool.name)).toEqual(['list_vocab']);

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
