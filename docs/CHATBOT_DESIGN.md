# Vocab Chatbot — Final Design

> Simple, production-safe MVP. No over-engineering. Optimize when real usage data exists.

---

## 1. Architecture

```
Client
  │  WebSocket (chat events)
  ▼
ChatGateway (WebSocket)
  │  validate JWT (handshake) → store userId → { socketId, tier }
  │  check rate limit (Redis INCR)
  │  subscribe to chat:{userId}:done / :error / :event on connect
  │  save user message
  ▼
BullMQ Queue: "ai-chat"
  │  priority: ADMIN=10 │ MEMBER=5 │ GUEST=1
  │  attempts: 3, backoff: exponential 2s
  │  timeout: 60s
  ▼
ChatProcessor
  │  resolve AI provider (AiProviderFactory) ← FIRST
  │  build system prompt (fetch user context from DB)
  │  load last 10 messages (Postgres)
  │  Intent Guard → OUT_OF_SCOPE? → short-circuit
  │  call AI provider (full response, no streaming)
  │  agentic loop (per-tier iterations)
  │  save assistant message
  │  publish result → Redis Pub/Sub
  ▼
Redis Pub/Sub ──► ChatGateway ──► Client
  chat:{userId}:done     → ai_done  { content }
  chat:{userId}:error    → ai_error { message, retryable, code? }
  chat:{userId}:event    → ai_tool_used | ai_confirm_required
```

**Why no streaming:** API-key-based providers (OmniRoute, OpenRouter, Gemini, Groq) work well as request/response. Streaming adds complexity (chunked delivery, reconnect logic, partial renders) with no real benefit for typical short AI responses.

**Why BullMQ:** rate-limit AI API, auto-retry, priority queue per tier.

**Why Redis Pub/Sub:** Worker and Gateway may run on different pods. EventEmitter is process-local.

**Why 1 conversation per user:** chatbot is an in-app support assistant, not a multi-session product. No `ChatSession` needed.

---

## 2. REST Endpoints

```
GET    /chat/messages?cursor=<ISO timestamp>&limit=10   → paginated history (default 10, max 50, createdAt DESC)
DELETE /chat/history                                    → clear chat history + set cancel flag for pending jobs
```

All endpoints: `@UseGuards(RolesGuard)` + `@Roles([ADMIN, MEMBER, GUEST])` + standard Swagger decorators.

`ChatMessageDto` exposes: `{ id, role, content, toolCalls, createdAt }`. Strips `tokenCount`/`latencyMs` (internal metrics).

---

## 3. WebSocket Events

### Client → Server

| Event               | Payload                         | Description              |
| ------------------- | ------------------------------- | ------------------------ |
| `send_message`      | `{ message }` — @MaxLength(300) | Send user message        |
| `load_history`      | `{ cursor }` — ISO timestamp    | Paginate older messages  |
| `confirm_response`  | `{ confirmed, requestId }`      | Accept/reject write tool |
| `cancel_generation` | `{}`                            | Cancel pending job       |

### Server → Client

| Event                 | Payload                                      | Description                 |
| --------------------- | -------------------------------------------- | --------------------------- |
| `message_queued`      | `{ messageId }`                              | Ack — show loading state    |
| `ai_tool_used`        | `{ toolName, label }`                        | "Looking up vocabulary…"    |
| `ai_confirm_required` | `{ requestId, action, params }`              | Write tool confirm dialog   |
| `ai_done`             | `{ content }`                                | Full AI response            |
| `ai_error`            | `{ message, retryable, code? }`              | Error (inc. QUOTA_EXCEEDED) |
| `history_loaded`      | `{ messages: ChatMessageDto[], nextCursor }` | Response to load_history    |

Client flow: send message → show loading spinner → receive `ai_done { content }` → render full response.

---

## 4. Data Flow

### 4.1 User sends message

```
1. Client emits send_message { message }  — validated @MaxLength(300)

2. ChatGateway:
   ├── Verify JWT (handshake) → store userId → { socketId, tier }
   ├── Check rate limit: Redis INCR chat:ratelimit:{userId} EX 60
   │     → reject with ai_error if over TIER_LIMITS[tier]
   └── Subscribe to chat:{userId}:done / :error / :event on connect
       Unsubscribe on disconnect

3. ChatService:
   ├── Save ChatMessage { userId, role: USER, content }
   ├── Emit message_queued { messageId } → client shows loading
   └── try { Enqueue BullMQ job { userId, messageId, tier } }
       catch → emit ai_error { message: 'Failed to queue request', retryable: true }
               (keep orphaned user message — audit trail)
```

### 4.2 Worker processes job

```
1. Dequeue from BullMQ

2. Check Redis cancel flag: chat:{userId}:cancelled
   └── If set → delete flag, publish chat:{userId}:done { content: '' }, exit

3. Resolve AI provider:
   └── AiProviderFactory.getProvider(userId)   ← resolved FIRST, reused for Intent Guard + agentic loop
       Reads ai.provider config → gemini | openrouter | groq | omniroute
       Default: omniroute

4. Build system prompt:
   ├── Fetch user context from DB: name, tier, active folder, active language
   └── "You are an AI assistant inside a vocabulary learning app.
       You ONLY answer questions related to:
       - vocabulary
       - learning progress
       - folders
       - trainer sessions
       - reminders
       - features of this application
       If the user asks about anything unrelated to the app, politely refuse."

5. Load conversation history:
   └── Postgres: SELECT last 10 messages WHERE userId ORDER BY createdAt ASC

6. Intent Guard (fast, no tools):
   ├── Call provider.generateContent() to classify: APP | OUT_OF_SCOPE
   │     "Classify the intent. Reply APP or OUT_OF_SCOPE.
   │      APP = vocabulary, learning progress, folders, trainer sessions,
   │            reminders, or features of this application.
   │      OUT_OF_SCOPE = anything else.
   │      Message: ${userMessage}"
   ├── Intent Guard failure → fail open, treat as APP, continue
   ├── OUT_OF_SCOPE → save + publish:
   │     "Sorry, I can only help with app-related questions."
   │     exit — skip agentic loop
   └── APP → continue

7. Agentic loop (per-tier max iterations: GUEST=2, MEMBER=3, ADMIN=4):
   ├── Map McpTool[] → McpToolDeclaration[] (zod-to-json-schema)
   ├── Call provider.chat({ systemPrompt, history, tools, message })
   │     → full response, no streaming
   ├── Response is TEXT → exit loop
   └── Response is TOOL_CALL:
       ├── Validate params (Zod)
       ├── Write tool? → publish to chat:{userId}:event:
       │     { type: 'confirm_required', requestId, action, params }
       │     Gateway emits ai_confirm_required → client shows dialog
       │     subscribeOnce(chat:{userId}:confirm:{requestId}, 30000)
       │     confirmed → execute │ rejected/timeout → append "User declined"
       ├── Publish to chat:{userId}:event: { type: 'tool_used', toolName, label }
       ├── Execute: Promise.race([tool.execute(), timeout(5000)])
       ├── Append tool result to in-memory history (trim if > 2000 chars)
       └── Loop again
   └── Exhausted without TEXT response:
       → Save "I wasn't able to complete this in the allowed steps. Please try rephrasing."
       → Log + Sentry alert
       → Publish to chat:{userId}:done { content: <fallback> }

8. Save ChatMessage { userId, role: ASSISTANT, content, toolCalls, tokenCount, latencyMs }

9. Redis PUBLISH chat:{userId}:done { content }

10. On failure (after 3 retries):
    Redis PUBLISH chat:{userId}:error { message, retryable: false }
    Move job to DLQ → Sentry alert
```

### 4.3 Cancel generation

```
Client emits cancel_generation {}

ChatGateway:
└── Redis SET chat:{userId}:cancelled 1 EX 300

Worker checks at step 2:
└── Cancels before the job starts (in-flight jobs complete normally)

Note: No mid-flight cancellation needed — no streaming, response is atomic.
      Cancel only prevents a queued job from executing.
```

### 4.4 Write tool confirm flow

```
Worker calls a write tool:
1. Generate requestId (nanoid)
2. Publish to chat:{userId}:event: { type: 'confirm_required', requestId, action, params }
3. Gateway emits ai_confirm_required { requestId, action, params } to client

Client shows confirm dialog → user accepts or rejects
4. Client emits confirm_response { confirmed, requestId }

ChatGateway:
5. Redis PUBLISH chat:{userId}:confirm:{requestId}  "confirmed" | "rejected"

Worker:
6. subscribeOnce(chat:{userId}:confirm:{requestId}, 30000)
   ├── "confirmed"  → execute tool
   ├── "rejected"   → append "User declined" to messages
   └── timeout 30s  → treat as rejected, resolve
```

### 4.5 Gateway event routing

```typescript
// :event channel payload — discriminated union
type ChatEventPayload =
  | { type: 'tool_used'; toolName: string; label: string }
  | { type: 'confirm_required'; requestId: string; action: string; params: Record<string, unknown> }

// Gateway handler
const event = JSON.parse(message) as ChatEventPayload;
if (event.type === 'tool_used')        socket.emit('ai_tool_used', ...);
if (event.type === 'confirm_required') socket.emit('ai_confirm_required', ...);
```

---

## 5. Database Schema

```prisma
enum ChatRole {
  USER
  ASSISTANT
}

model ChatMessage {
  id         String   @id @default(cuid())
  userId     String
  role       ChatRole
  content    String   @db.Text
  toolCalls  Json?    // [{ toolName, params?, success, latencyMs }] — metadata only
  tokenCount Int?
  latencyMs  Int?
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Asc)])
  @@map("chat_messages")
}
```

**`toolCalls` shape — metadata only, no full result:**

```typescript
type ToolCallMeta = {
    toolName: string;
    params?: Record<string, unknown>; // omit if sensitive
    success: boolean;
    latencyMs: number;
};
```

---

## 6. AI Provider Extension

`IAiProvider` needs a `chat()` method (existing `generateContent` is single-prompt only, no tools, no history):

```typescript
// NEW — add to IAiProvider
chat(params: ChatParams): Promise<ChatResponse>;

interface ChatHistoryMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

interface ChatParams {
  systemPrompt: string;
  history: ChatHistoryMessage[];    // last 10 messages from Postgres
  tools: McpToolDeclaration[];      // filtered by tier, mapped from McpTool[]
  message: string;                  // current user message — each provider appends as final user turn
}

type ChatResponse =
  | { type: 'text'; content: string; tokenCount?: number }
  | { type: 'tool_call'; name: string; params: unknown };

interface McpToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema via zod-to-json-schema
}
```

Each provider (`GeminiProvider`, `OmniRouteProvider`, etc.) implements `chat()` using its own SDK. `ChatProcessor` stays provider-agnostic.

---

## 7. Redis Pub/Sub Infrastructure

`RedisService` has no pub/sub support. A new `RedisPubSubService` is required:

```
src/shared/services/redis-pub-sub.service.ts
```

Two ioredis clients internally (Redis protocol requires dedicated connection for subscribe mode):

```typescript
@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
    publish(channel: string, payload: unknown): Promise<void>;
    subscribe(channel: string, handler: (msg: string) => void): void;
    unsubscribe(channel: string): void;
    subscribeOnce(channel: string, timeoutMs: number): Promise<string>;
}
```

Registered in `SharedModule`, exported globally.

---

## 8. MCP Tool Registry

```typescript
interface McpTool {
    name: string;
    description: string; // sent to AI provider as function declaration
    schema: ZodSchema; // param validation before execute + converted to JSON Schema
    minTier: UserRole; // GUEST | MEMBER | ADMIN
    isWrite: boolean; // triggers confirm flow if true
    timeoutMs: number; // default 5000
    execute(params: unknown, userId: string): Promise<unknown>;
}
```

`McpToolRegistry` at `src/domains/chat/services/mcp-tool-registry.service.ts`.
Tools registered as static array in constructor. Each tool's `execute()` uses injected repositories.
`ChatModule` imports `VocabModule`, `TrainerModule`, `NotificationModule`, `ReminderModule`.

### Read Tools (15)

```
Vocab:
  lookup_vocab            minTier: GUEST
  get_vocab_detail        minTier: GUEST
  get_related_words       minTier: GUEST
  get_random_vocab        minTier: GUEST
  get_weak_vocabs         minTier: MEMBER
  get_vocab_progress      minTier: MEMBER
  get_vocab_distribution  minTier: MEMBER
  get_vocab_by_subject    minTier: MEMBER
  get_vocab_dashboard     minTier: MEMBER

Trainer:
  get_trainer_sessions    minTier: MEMBER
  get_trainer_detail      minTier: MEMBER
  get_exam_result         minTier: MEMBER

Context:
  get_my_folders          minTier: GUEST
  get_subjects            minTier: GUEST
  get_languages           minTier: GUEST
```

### Write Tools (4) — all require confirm, all MEMBER+

```
  create_scheduled_reminder   minTier: MEMBER   isWrite: true
  create_immediate_reminder   minTier: MEMBER   isWrite: true
  mark_notification_read      minTier: MEMBER   isWrite: true
  mark_all_notifications_read minTier: MEMBER   isWrite: true
```

**Every tool:** always filter Prisma queries with `WHERE userId = <from JWT>`. Never accept userId from tool params.

---

## 9. Key Constraints

### Rate Limiting

| Tier   | Messages/min | Max iterations | Write tools |
| ------ | ------------ | -------------- | ----------- |
| GUEST  | 10           | 2              | No          |
| MEMBER | 30           | 3              | Yes         |
| ADMIN  | 100          | 4              | Yes         |

Implementation: Redis INCR + EXPIRE. Tier read from JWT at handshake, stored in `userId → { socketId, tier }` map.

### Token Limits

```
History:        10 messages (Postgres)
Tool result:    Trim to 2000 chars before appending to in-memory history
Max response:   1000 tokens (configured per provider in ai.config)
Intent Guard:   ~50 tokens per call (generateContent, fast)
```

### Timeouts & Retries

```
BullMQ job timeout:   60s
BullMQ attempts:      3 (exponential backoff: 2s base)
Per-tool timeout:     5s (Promise.race)
Confirm dialog:       30s (subscribeOnce, then treat as rejected)
Cancel flag TTL:      5 min (Redis EX 300)
```

---

## 10. Failure Handling

| Failure                   | Behavior                                                      |
| ------------------------- | ------------------------------------------------------------- |
| AI provider timeout (60s) | BullMQ retry (max 3x) → DLQ → Sentry alert                    |
| Intent Guard failure      | Fail open — treat as APP, continue                            |
| Tool execution error      | Return error string to AI, AI continues with partial data     |
| Tool timeout (5s)         | Return `"Tool timed out"` to AI, no crash                     |
| Worker crash              | BullMQ auto-retry on next available worker                    |
| Confirm timeout (30s)     | Treat as rejected, AI continues without write action          |
| DLQ job                   | Sentry alert with full job context for debugging              |
| Max iterations exhausted  | Save fallback assistant message, Sentry alert                 |
| Enqueue failure           | Emit ai_error { retryable: true }, keep orphaned user message |

---

## 11. Observability

```typescript
logger.info('chat.job.start', { userId, tier, jobId });
logger.info('chat.intent', { userId, intent, latencyMs });
logger.info('chat.tool.called', { toolName, success, latencyMs, userId });
logger.info('chat.job.done', { userId, totalTokens, totalLatencyMs, toolCount, iterations });
logger.error('chat.job.failed', { userId, error, jobId });
```

Sentry alerts: job fails after 3 retries, agentic loop hits max iterations, tool error rate > 10%, AI provider error.

---

## 12. Implementation Order

### Sprint 1 — Foundation

```
1. DB migration: ChatMessage (userId, no ChatSession)
2. RedisPubSubService in SharedModule (two ioredis clients)
3. ChatModule: service, gateway, REST controller
4. BullMQ queue: ai-chat
5. Gateway: subscribe to done/error/event on connect, unsubscribe on disconnect
6. Basic send_message → @MaxLength(300) → queue → ChatProcessor → emit ai_done (stub response)
```

### Sprint 2 — AI Core

```
1. McpToolRegistry: register/filter/execute (repositories injected directly)
2. 15 Read Tools: vocab + trainer + folder + language
3. Intent Guard: provider resolved first, APP vs OUT_OF_SCOPE
4. ChatWorker: fetch user context from DB + system prompt + history + provider.chat()
5. Agentic loop: per-tier caps (2/3/4), fallback message on exhaustion
6. McpToolDeclaration mapping via zod-to-json-schema
```

### Sprint 3 — Production Safety

```
1. Rate limiting: JWT role at handshake, TIER_LIMITS check per message
2. Write Tools + confirm flow (via :event channel + subscribeOnce)
3. Tool timeout: Promise.race
4. Dynamic tool exposure by tier
5. Cancel: Redis flag
6. DELETE /chat/history: deleteMany + set cancel flag
7. Enqueue failure: try/catch → ai_error emit
8. Failure handling: DLQ, Sentry, ai_error
9. Observability: Winston at all key points
```

---

## Dropped from V1

| Feature                 | Reason                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Streaming               | API-key providers work well as request/response; streaming adds complexity with no real benefit |
| `ChatSession`           | Single conversation per user — no multi-session needed                                          |
| `contextSnapshot`       | AI calls tools for real-time data                                                               |
| Redis cache for history | 10-message Postgres query is trivially cheap                                                    |
| Token summarization     | YAGNI — add when usage data shows it's needed                                                   |
| Full tool result in DB  | Metadata only — keeps rows small                                                                |
| Multi-tab WebSocket     | Last-connected tab wins — acceptable for MVP support assistant                                  |
