## 1. High-level System Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Client]
        MOBILE[Mobile App]
    end

    subgraph "API Gateway Layer"
        API[REST API<br/>/api/v1]
        WS[WebSocket<br/>Socket.IO]
        SSE[Server-Sent Events<br/>/sse/events]
    end

    subgraph "NestJS Application - Modular Monolith"
        subgraph "Presentation Layer"
            CTRL_AUTH[Auth Controllers]
            CTRL_VOCAB[Vocab Controllers]
            CTRL_TRAINER[Trainer Controllers]
            CTRL_NOTIF[Notification Controllers]
            CTRL_ADMIN[Admin Controllers]
        end

        subgraph "Business Logic Layer"
            SVC_AUTH[Auth Services]
            SVC_VOCAB[Vocab Services]
            SVC_TRAINER[Trainer Services]
            SVC_AI[AI Services]
            SVC_NOTIF[Notification Services]
            SVC_REMINDER[Reminder Services]
            SVC_MASTERY[Mastery Services]
        end

        subgraph "Data Access Layer"
            REPO[Prisma Repositories]
            CACHE[Redis Cache]
        end

        subgraph "Background Jobs"
            QUEUE_EMAIL[Email Queue]
            QUEUE_AI[AI Processing Queue]
            QUEUE_NOTIF[Notification Queue]
            QUEUE_FCM[FCM Queue]
            SCHEDULER[Reminder Scheduler]
            DLQ[Dead Letter Queue]
        end
    end

    subgraph "External Services"
        SUPABASE[Supabase<br/>Auth + Storage]
        FIREBASE[Firebase FCM<br/>Push Notifications]
        AI_GEMINI[Google Gemini AI]
        AI_OPENROUTER[OpenRouter AI]
        AI_GROQ[Groq AI]
        CLOUDINARY[Cloudinary<br/>Image Storage]
        SMTP[Email SMTP]
    end

    subgraph "Infrastructure"
        POSTGRES[(PostgreSQL<br/>Primary Database)]
        REDIS[(Redis<br/>Cache + Queues)]
        BULL[BullMQ<br/>Job Processor]
    end

    subgraph "Monitoring"
        BULLBOARD[Bull Board<br/>Queue Dashboard]
        SWAGGER[Swagger UI<br/>API Docs]
    end

    %% Client connections
    WEB --> API
    WEB --> WS
    WEB --> SSE
    MOBILE --> API
    MOBILE --> WS

    %% API to Controllers
    API --> CTRL_AUTH
    API --> CTRL_VOCAB
    API --> CTRL_TRAINER
    API --> CTRL_NOTIF
    API --> CTRL_ADMIN
    WS --> CTRL_NOTIF
    SSE --> CTRL_NOTIF

    %% Controllers to Services
    CTRL_AUTH --> SVC_AUTH
    CTRL_VOCAB --> SVC_VOCAB
    CTRL_TRAINER --> SVC_TRAINER
    CTRL_NOTIF --> SVC_NOTIF
    CTRL_ADMIN --> BULLBOARD

    %% Service interactions
    SVC_VOCAB --> SVC_AI
    SVC_VOCAB --> SVC_NOTIF
    SVC_TRAINER --> SVC_AI
    SVC_TRAINER --> SVC_MASTERY
    SVC_TRAINER --> SVC_REMINDER
    SVC_REMINDER --> SCHEDULER

    %% Services to Data Layer
    SVC_AUTH --> REPO
    SVC_VOCAB --> REPO
    SVC_TRAINER --> REPO
    SVC_NOTIF --> REPO
    SVC_REMINDER --> REPO
    SVC_MASTERY --> REPO
    SVC_AUTH --> CACHE
    SVC_VOCAB --> CACHE

    %% Data Layer to Infrastructure
    REPO --> POSTGRES
    CACHE --> REDIS
    SCHEDULER --> REDIS

    %% Background Jobs
    SVC_AI --> QUEUE_AI
    SVC_NOTIF --> QUEUE_NOTIF
    SVC_NOTIF --> QUEUE_FCM
    SVC_REMINDER --> QUEUE_EMAIL
    QUEUE_AI --> BULL
    QUEUE_NOTIF --> BULL
    QUEUE_FCM --> BULL
    QUEUE_EMAIL --> BULL
    BULL --> REDIS
    BULL --> DLQ

    %% External Service Integrations
    SVC_AUTH --> SUPABASE
    SVC_VOCAB --> SUPABASE
    QUEUE_AI --> AI_GEMINI
    QUEUE_AI --> AI_OPENROUTER
    QUEUE_AI --> AI_GROQ
    QUEUE_FCM --> FIREBASE
    QUEUE_EMAIL --> SMTP
    SVC_VOCAB --> CLOUDINARY

    %% Monitoring
    BULLBOARD --> BULL
    SWAGGER --> API

    style API fill:#4CAF50
    style WS fill:#2196F3
    style SSE fill:#FF9800
    style POSTGRES fill:#336791
    style REDIS fill:#DC382D
    style BULL fill:#D32F2F
```

**Explanation:**

- **Modular Monolith**: Single deployable application with clear layer separation
- **Three-tier architecture**: Presentation (Controllers) → Business Logic (Services) → Data Access (Repositories)
- **Async processing**: BullMQ handles 7 workload queues for AI, notifications, and reminders
- **Real-time capabilities**: WebSocket for bidirectional communication, SSE for server-push events
- **External dependencies**: Supabase for auth/storage, Firebase for push, multiple AI providers for flexibility
- **Caching strategy**: Redis for rate limiting, quota tracking, and session management

---

## 2. Module/Service Interaction Diagram

```mermaid
graph TB
    subgraph "Core Infrastructure Modules"
        AUTH[Auth Module<br/>JWT + Guards]
        DB[Database Module<br/>Prisma Client]
        QUEUE[Queues Module<br/>BullMQ]
        COMMON[Common Module<br/>Filters + Logger]
        SHARED[Shared Module<br/>Utilities]
    end

    subgraph "Identity Domain"
        IDENTITY_AUTH[Identity Auth Module<br/>Signup/Signin/OAuth]
        USER[User Module<br/>User Management]
    end

    subgraph "Catalog Domain"
        LANGUAGE[Language Module]
        FOLDER[Language Folder Module]
        SUBJECT[Subject Module]
        WORDTYPE[Word Type Module]
        PLAN[Plan Module<br/>Subscription Tiers]
    end

    subgraph "Vocab Domain"
        VOCAB[Vocab Module<br/>CRUD + Import]
        MASTERY[Vocab Mastery<br/>Score Tracking]
    end

    subgraph "Vocab Trainer Domain"
        TRAINER[Vocab Trainer Module<br/>Exam Management]
        TRAINER_RESULT[Trainer Result<br/>Answer Evaluation]
    end

    subgraph "AI Domain"
        AI[AI Module<br/>Translation + Generation]
    end

    subgraph "Notification Domain"
        NOTIFICATION[Notification Module<br/>In-app Notifications]
        EMAIL[Email Module<br/>Transactional Emails]
        FCM[FCM Module<br/>Push Notifications]
    end

    subgraph "Reminder Domain"
        REMINDER[Reminder Module<br/>Scheduler + Escalation]
    end

    subgraph "Media Domain"
        SUPABASE[Supabase Module<br/>Auth + Storage]
        CLOUDINARY[Cloudinary Module<br/>Image Upload]
    end

    subgraph "Platform Domain"
        CONFIG[Config Module<br/>System/User Settings]
        SSE_MOD[SSE Module<br/>Real-time Events]
        EVENTS[Events Module<br/>WebSocket Gateways]
        WEBHOOK[Webhook Module]
        ADMIN[Admin Module<br/>Bull Board]
    end

    %% Infrastructure dependencies (all modules depend on these)
    IDENTITY_AUTH -.-> AUTH
    USER -.-> AUTH
    VOCAB -.-> AUTH
    TRAINER -.-> AUTH
    NOTIFICATION -.-> AUTH
    REMINDER -.-> AUTH

    IDENTITY_AUTH -.-> DB
    USER -.-> DB
    VOCAB -.-> DB
    TRAINER -.-> DB
    NOTIFICATION -.-> DB
    REMINDER -.-> DB
    LANGUAGE -.-> DB
    FOLDER -.-> DB
    SUBJECT -.-> DB
    PLAN -.-> DB

    %% Domain interactions
    IDENTITY_AUTH --> SUPABASE
    IDENTITY_AUTH --> USER

    VOCAB --> LANGUAGE
    VOCAB --> FOLDER
    VOCAB --> WORDTYPE
    VOCAB --> USER
    VOCAB --> AI
    VOCAB --> NOTIFICATION
    VOCAB --> QUEUE
    VOCAB --> CLOUDINARY
    VOCAB --> PLAN
    VOCAB --> MASTERY

    TRAINER --> VOCAB
    TRAINER --> USER
    TRAINER --> AI
    TRAINER --> QUEUE
    TRAINER --> NOTIFICATION
    TRAINER --> REMINDER
    TRAINER --> MASTERY
    TRAINER --> TRAINER_RESULT

    MASTERY --> VOCAB
    MASTERY --> USER

    AI --> CONFIG
    AI --> QUEUE

    NOTIFICATION --> USER
    NOTIFICATION --> QUEUE
    NOTIFICATION --> EVENTS
    NOTIFICATION --> SSE_MOD

    EMAIL --> QUEUE
    FCM --> QUEUE
    FCM --> USER

    REMINDER --> USER
    REMINDER --> QUEUE
    REMINDER --> EMAIL

    FOLDER --> LANGUAGE
    FOLDER --> USER

    SUBJECT --> USER

    ADMIN --> QUEUE

    CONFIG --> USER

    EVENTS --> NOTIFICATION

    style AUTH fill:#FF6B6B
    style DB fill:#4ECDC4
    style QUEUE fill:#FFE66D
    style VOCAB fill:#95E1D3
    style TRAINER fill:#A8E6CF
    style AI fill:#FFDAC1
    style NOTIFICATION fill:#C7CEEA
    style REMINDER fill:#B5EAD7
```

**Explanation:**

- **Infrastructure modules** (Auth, Database, Queues) are used by all domain modules
- **Identity domain** handles authentication via Supabase and user management
- **Catalog domain** provides reference data (languages, folders, subjects, plans)
- **Vocab domain** is the core business domain, depends on catalog, AI, and notifications
- **Trainer domain** orchestrates exams, depends on vocab, AI, mastery, and reminder
- **AI domain** is a shared service used by vocab and trainer for generation/evaluation
- **Notification domain** provides multi-channel notifications (in-app, email, push)
- **Reminder domain** implements sophisticated scheduling with escalation chains
- **Platform domain** provides cross-cutting concerns (config, real-time, admin)

---

## 3. Database ERD (Entity Relationship Diagram)

```mermaid
erDiagram
    User ||--o{ Vocab : creates
    User ||--o{ VocabTrainer : creates
    User ||--o{ Subject : creates
    User ||--o{ LanguageFolder : creates
    User ||--o{ NotificationRecipient : receives
    User ||--o{ UserFcmToken : has
    User ||--o{ Config : configures
    User ||--o{ VocabMastery : tracks
    User ||--o{ ReminderSchedule : receives
    User ||--|| Plan : "has role"

    Plan ||--|| UserRole : "maps to"

    Language ||--o{ Vocab : "source language"
    Language ||--o{ Vocab : "target language"
    Language ||--o{ LanguageFolder : "source language"
    Language ||--o{ LanguageFolder : "target language"

    LanguageFolder ||--o{ Vocab : contains

    Vocab ||--o{ TextTarget : "has translations"
    Vocab ||--o{ VocabTrainerWord : "assigned to"
    Vocab ||--o{ VocabMastery : "mastery tracked"
    Vocab ||--o{ VocabTrainerResult : "answered in"

    TextTarget ||--o{ VocabExample : "has examples"
    TextTarget ||--o{ TextTargetSubject : "categorized by"
    TextTarget ||--o| WordType : "has type"

    Subject ||--o{ TextTargetSubject : categorizes

    VocabTrainer ||--o{ VocabTrainerWord : "contains vocabs"
    VocabTrainer ||--o{ VocabTrainerResult : "has results"

    VocabMastery ||--o{ VocabMasteryHistory : "tracks history"

    Notification ||--o{ NotificationRecipient : "sent to"

    ReminderSchedule ||--o{ ReminderSchedule : "escalates to"

    User {
        string id PK
        string email UK
        string firstName
        string lastName
        string phone
        string avatar
        UserRole role
        boolean isActive
        string supabaseUserId UK
        datetime createdAt
        datetime updatedAt
    }

    Plan {
        string id PK
        UserRole role UK
        string name
        decimal price
        string priceLabel
        json limits
        json features
        string stripePriceId
        int sortOrder
        boolean isActive
    }

    Language {
        string id PK
        string code UK
        string name
        datetime createdAt
        datetime updatedAt
    }

    LanguageFolder {
        string id PK
        string name
        string folderColor
        string userId FK
        string sourceLanguageCode FK
        string targetLanguageCode FK
        datetime createdAt
        datetime updatedAt
    }

    Vocab {
        string id PK
        string textSource
        string sourceLanguageCode FK
        string targetLanguageCode FK
        string userId FK
        string languageFolderId FK
        datetime createdAt
        datetime updatedAt
    }

    TextTarget {
        string id PK
        string vocabId FK
        string wordTypeId FK
        string textTarget
        string grammar
        string explanationSource
        string explanationTarget
        datetime createdAt
        datetime updatedAt
    }

    VocabExample {
        string id PK
        string textTargetId FK
        string source
        string target
        datetime createdAt
        datetime updatedAt
    }

    WordType {
        string id PK
        string name UK
        string description
        datetime createdAt
        datetime updatedAt
    }

    Subject {
        string id PK
        string name
        int order
        string userId FK
        datetime createdAt
        datetime updatedAt
    }

    VocabTrainer {
        string id PK
        string name
        TrainerStatus status
        int countTime
        int setCountTime
        int reminderTime
        boolean reminderDisabled
        int reminderRepeat
        datetime reminderLastRemind
        datetime lastExamSubmittedAt
        QuestionType questionType
        json questionAnswers
        string userId FK
        datetime createdAt
        datetime updatedAt
    }

    VocabTrainerWord {
        string id PK
        string vocabTrainerId FK
        string vocabId FK
        datetime createdAt
        datetime updatedAt
    }

    VocabTrainerResult {
        string id PK
        string vocabTrainerId FK
        string vocabId FK
        TrainerStatus status
        string userSelected
        string systemSelected
        json data
        datetime createdAt
        datetime updatedAt
    }

    VocabMastery {
        string id PK
        string vocabId FK
        string userId FK
        float masteryScore
        int correctCount
        int incorrectCount
        datetime createdAt
        datetime updatedAt
    }

    VocabMasteryHistory {
        string id PK
        string vocabMasteryId FK
        float masteryScore
        int correctCount
        int incorrectCount
        datetime createdAt
    }

    Notification {
        string id PK
        NotificationType type
        NotificationAction action
        PriorityLevel priority
        json data
        boolean isActive
        datetime expiresAt
        datetime createdAt
        datetime updatedAt
    }

    NotificationRecipient {
        string id PK
        string notificationId FK
        string userId FK
        boolean isRead
        boolean isDeleted
        datetime createdAt
        datetime updatedAt
    }

    UserFcmToken {
        string userId FK
        string fcmToken FK
        string deviceType
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    Config {
        string id PK
        ConfigScope scope
        string userId FK
        string key
        json value
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    ReminderSchedule {
        string id PK
        string dedupeKey
        ReminderChannel channel
        string recipient
        string template
        int templateVersion
        json payload
        string subject
        datetime dueAt
        int priority
        ReminderScheduleStatus status
        int attempt
        int maxAttempts
        datetime nextAttemptAt
        string lockedBy
        datetime lockedAt
        string lastErrorCode
        string lastErrorMsg
        json errorHistory
        string providerMsgId
        ReminderScheduleKind reminderType
        int escalationLevel
        int escalationMax
        string initialReminderId FK
        datetime actedCheckAfter
        int chainCount
        int chainMax
        datetime cancelledAt
        string cancelledBy
        string cancelReason
        datetime sentAt
        datetime completedAt
        string userId FK
        string entityType
        string entityId
        json metadata
        datetime createdAt
        datetime updatedAt
    }

    JobFailure {
        string id PK
        string queueName
        string jobId
        string jobName
        json payload
        string error
        string stackTrace
        int attemptsMade
        int maxAttempts
        datetime failedAt
        datetime createdAt
    }
```

**Explanation:**

- **User-centric design**: User is the central entity with relationships to all major domains
- **Vocab hierarchy**: Vocab → TextTarget → VocabExample (one vocab can have multiple translations, each with examples)
- **Training system**: VocabTrainer contains VocabTrainerWord (many-to-many with Vocab), produces VocabTrainerResult
- **Mastery tracking**: VocabMastery tracks per-user, per-vocab progress with historical snapshots
- **Reminder escalation**: ReminderSchedule has self-referential relationship for escalation chains
- **Multi-language support**: Language entity supports source/target pairs for vocabulary
- **Notification system**: Notification → NotificationRecipient (many-to-many with User)
- **Plan-based access**: Plan entity maps to UserRole enum, defines quota limits

---

## 4. Sequence Diagrams for Key Flows

### 4.1 Vocabulary Creation with AI Translation

```mermaid
sequenceDiagram
    actor User
    participant API as Vocab Controller
    participant QuotaSvc as Quota Service
    participant VocabSvc as Vocab Service
    participant Redis as Redis Cache
    participant DB as PostgreSQL
    participant Queue as BullMQ
    participant AIWorker as AI Worker
    participant AISvc as AI Service
    participant NotifQueue as Notification Queue
    participant SSE as SSE Gateway

    User->>API: POST /vocabs<br/>{textSource, languages, folder}
    API->>QuotaSvc: checkDailyQuota(userId)
    QuotaSvc->>Redis: GET vocab:quota:{userId}:{date}
    Redis-->>QuotaSvc: count

    alt Quota exceeded (GUEST: 20/day)
        QuotaSvc-->>API: QuotaExceededException
        API-->>User: 403 Upgrade Required
    else Quota OK
        QuotaSvc->>Redis: INCR vocab:quota:{userId}:{date}
        API->>VocabSvc: createVocab(dto)
        VocabSvc->>DB: INSERT INTO vocab
        DB-->>VocabSvc: vocab entity

        alt No translations provided
            VocabSvc->>Queue: enqueue(VOCAB_TRANSLATION, {vocabId})
            Queue-->>VocabSvc: jobId
            VocabSvc-->>API: vocab (pending translation)
            API-->>User: 201 Created

            Queue->>AIWorker: process job
            AIWorker->>AISvc: translateVocab(vocabId)
            AISvc->>AISvc: Call Gemini/OpenRouter API
            AISvc-->>AIWorker: translations[]
            AIWorker->>DB: INSERT INTO text_target, vocab_example
            AIWorker->>NotifQueue: enqueue(NOTIFICATION, {userId, type: VOCAB, action: CREATE})
            AIWorker->>SSE: emit('vocab-translation-complete', {vocabId})
            SSE-->>User: SSE event
        else Translations provided
            VocabSvc->>DB: INSERT INTO text_target, vocab_example
            VocabSvc->>NotifQueue: enqueue(NOTIFICATION, {userId})
            VocabSvc-->>API: vocab (complete)
            API-->>User: 201 Created
        end
    end
```

**Explanation:**

- **Quota enforcement**: Redis tracks daily vocab creation per user based on plan limits
- **Async AI processing**: Translation generation happens in background queue to avoid blocking
- **Real-time updates**: SSE pushes completion event to user when AI finishes
- **Graceful degradation**: User can provide translations manually to skip AI step

---

### 4.2 Training Exam Submission & Mastery Update

```mermaid
sequenceDiagram
    actor User
    participant API as Trainer Controller
    participant TrainerSvc as Trainer Service
    participant MasterySvc as Mastery Service
    participant ReminderSvc as Reminder Service
    participant DB as PostgreSQL
    participant Queue as BullMQ
    participant AIWorker as AI Worker

    User->>API: POST /vocab-trainers/{id}/submit<br/>{answers[]}
    API->>TrainerSvc: submitExam(trainerId, answers)
    TrainerSvc->>DB: SELECT vocab_trainer, vocab_trainer_word
    DB-->>TrainerSvc: trainer + vocabs

    alt Question type requires AI evaluation
        TrainerSvc->>Queue: enqueue(FILL_IN_BLANK_EVALUATION, {trainerId, answers})
        Queue-->>TrainerSvc: jobId
        TrainerSvc-->>API: {status: 'processing'}
        API-->>User: 202 Accepted

        Queue->>AIWorker: process evaluation
        AIWorker->>AIWorker: Call AI to grade answers
        AIWorker->>DB: INSERT INTO vocab_trainer_result
        AIWorker->>MasterySvc: updateMasteryScores(results)
    else Simple evaluation (Multiple Choice, Flip Card)
        TrainerSvc->>TrainerSvc: evaluateAnswers()
        TrainerSvc->>DB: INSERT INTO vocab_trainer_result
        TrainerSvc->>MasterySvc: updateMasteryScores(results)
    end

    MasterySvc->>DB: SELECT vocab_mastery WHERE vocabId IN (...)
    DB-->>MasterySvc: existing mastery records

    loop For each vocab result
        alt Correct answer
            MasterySvc->>MasterySvc: masteryScore += 1 (max 10)
            MasterySvc->>MasterySvc: correctCount += 1
        else Incorrect answer
            MasterySvc->>MasterySvc: masteryScore -= 1 (min 0)
            MasterySvc->>MasterySvc: incorrectCount += 1
        end
        MasterySvc->>DB: UPDATE vocab_mastery
        MasterySvc->>DB: INSERT INTO vocab_mastery_history
    end

    MasterySvc-->>TrainerSvc: mastery updated
    TrainerSvc->>DB: UPDATE vocab_trainer<br/>SET status='COMPLETED', lastExamSubmittedAt=NOW()

    TrainerSvc->>ReminderSvc: scheduleReminder(trainerId, userId)
    ReminderSvc->>DB: INSERT INTO reminder_schedule<br/>{dueAt: NOW() + 2 days, reminderType: INITIAL}
    ReminderSvc-->>TrainerSvc: reminder scheduled

    TrainerSvc-->>API: {status: 'completed', results}
    API-->>User: 200 OK
```

**Explanation:**

- **Conditional AI evaluation**: Fill-in-blank and audio questions require AI grading, others are instant
- **Mastery algorithm**: Simple +1 for correct, -1 for incorrect (bounded 0-10)
- **Historical tracking**: Every mastery change is logged for analytics
- **Automatic reminder**: Initial reminder scheduled for 2 days after exam completion
- **Status tracking**: Trainer status transitions from IN_PROCESS → COMPLETED

---

### 4.3 Reminder Escalation Flow (v3 - DB-first)

```mermaid
sequenceDiagram
    participant Scheduler as Scheduler Poller<br/>(Cron Job)
    participant DB as PostgreSQL
    participant Queue as Email Queue
    participant EmailWorker as Email Worker
    participant SMTP as Email Provider
    participant User

    Note over Scheduler: Runs every 1 minute

    Scheduler->>DB: SELECT * FROM reminder_schedule<br/>WHERE status='PENDING'<br/>AND dueAt <= NOW()<br/>ORDER BY priority DESC, dueAt ASC<br/>LIMIT 100 FOR UPDATE SKIP LOCKED
    DB-->>Scheduler: due reminders[]

    loop For each reminder
        Scheduler->>DB: UPDATE reminder_schedule<br/>SET status='CLAIMED', lockedBy='scheduler-1', lockedAt=NOW()
        Scheduler->>Queue: enqueue(EMAIL_REMINDER, {reminderId})
        Scheduler->>DB: UPDATE reminder_schedule<br/>SET status='QUEUED'
    end

    Queue->>EmailWorker: process job
    EmailWorker->>DB: SELECT reminder_schedule WHERE id=reminderId
    DB-->>EmailWorker: reminder

    EmailWorker->>DB: UPDATE reminder_schedule<br/>SET status='SENDING', attempt += 1
    EmailWorker->>SMTP: sendEmail(recipient, template, payload)

    alt Email sent successfully
        SMTP-->>EmailWorker: messageId
        EmailWorker->>DB: UPDATE reminder_schedule<br/>SET status='SENT', sentAt=NOW(), providerMsgId=messageId

        alt Initial reminder (escalationLevel=0)
            EmailWorker->>DB: INSERT INTO reminder_schedule (3 rows)<br/>{dueAt: +1/+2/+3 days, reminderType: ESCALATION, escalationLevel: 1/2/3}
        else Escalation reminder
            EmailWorker->>DB: SELECT user.lastExamSubmittedAt
            DB-->>EmailWorker: lastExamSubmittedAt

            alt User acted (lastExamSubmittedAt > actedCheckAfter)
                EmailWorker->>DB: UPDATE reminder_schedule<br/>SET status='CANCELLED', cancelReason='user_acted'<br/>WHERE initialReminderId={id} AND status='PENDING'
                Note over EmailWorker: Cancel remaining escalations
            else User not acted
                Note over EmailWorker: Continue escalation chain
            end
        end

        EmailWorker->>DB: UPDATE reminder_schedule<br/>SET status='SENT', completedAt=NOW()
        EmailWorker-->>Queue: job complete

    else Email failed (retryable)
        SMTP-->>EmailWorker: error
        EmailWorker->>DB: UPDATE reminder_schedule<br/>SET status='FAILED_RETRYABLE', nextAttemptAt=NOW() + backoff, lastErrorMsg=error
        EmailWorker-->>Queue: job failed (will retry)

    else Email failed (terminal)
        SMTP-->>EmailWorker: fatal error
        EmailWorker->>DB: UPDATE reminder_schedule<br/>SET status='FAILED_TERMINAL', lastErrorMsg=error
        EmailWorker->>DB: INSERT INTO job_failure
        EmailWorker-->>Queue: job failed (terminal)
    end

    SMTP->>User: Email delivered
```

**Explanation:**

- **DB-first design**: Scheduler polls database instead of relying on queue delays
- **Pessimistic locking**: `FOR UPDATE SKIP LOCKED` prevents duplicate processing
- **State machine**: PENDING → CLAIMED → QUEUED → SENDING → SENT (or FAILED)
- **Escalation chain**: Initial reminder creates 3 escalation rows (+1/+2/+3 days)
- **Smart cancellation**: Checks if user acted (completed exam) before sending escalations
- **Retry logic**: Failed emails transition to FAILED_RETRYABLE with exponential backoff
- **Dead letter handling**: Terminal failures logged to job_failure table

---

### 4.4 Mastery Score Update Flow

```mermaid
sequenceDiagram
    participant TrainerSvc as Trainer Service
    participant MasterySvc as Mastery Service
    participant DB as PostgreSQL
    participant NotifQueue as Notification Queue

    TrainerSvc->>MasterySvc: updateMasteryScores(results[])

    loop For each vocab result
        MasterySvc->>DB: SELECT vocab_mastery<br/>WHERE vocabId={id} AND userId={userId}

        alt Mastery record exists
            DB-->>MasterySvc: existing mastery
        else No mastery record
            MasterySvc->>DB: INSERT INTO vocab_mastery<br/>{vocabId, userId, masteryScore: 0, correctCount: 0, incorrectCount: 0}
            DB-->>MasterySvc: new mastery
        end

        alt Answer is correct
            MasterySvc->>MasterySvc: masteryScore = min(masteryScore + 1, 10)
            MasterySvc->>MasterySvc: correctCount += 1
        else Answer is incorrect
            MasterySvc->>MasterySvc: masteryScore = max(masteryScore - 1, 0)
            MasterySvc->>MasterySvc: incorrectCount += 1
        end

        MasterySvc->>DB: BEGIN TRANSACTION
        MasterySvc->>DB: UPDATE vocab_mastery<br/>SET masteryScore={score}, correctCount={count}, incorrectCount={count}
        MasterySvc->>DB: INSERT INTO vocab_mastery_history<br/>{vocabMasteryId, masteryScore, correctCount, incorrectCount}
        MasterySvc->>DB: COMMIT

        alt Mastery milestone reached (score = 10)
            MasterySvc->>NotifQueue: enqueue(NOTIFICATION, {userId, type: VOCAB, action: UPDATE, data: {milestone: 'mastered'}})
        else Mastery dropped significantly (score <= 2)
            MasterySvc->>NotifQueue: enqueue(NOTIFICATION, {userId, type: VOCAB, action: UPDATE, data: {milestone: 'needs_review'}})
        end
    end

    MasterySvc-->>TrainerSvc: mastery updated
```

**Explanation:**

- **Lazy initialization**: Mastery records created on first answer (not on vocab creation)
- **Bounded scoring**: Score clamped between 0 (needs review) and 10 (mastered)
- **Atomic updates**: Mastery + history inserted in single transaction
- **Milestone notifications**: Users notified when vocab is mastered or needs review
- **Historical tracking**: Every score change logged for progress analytics

---

## Summary

I've reconstructed 4 comprehensive architecture diagrams for your vocabulary learning platform:

1. **System Architecture**: Shows the modular monolith structure with NestJS layers, external integrations (Supabase, Firebase, AI providers), infrastructure (PostgreSQL, Redis, BullMQ), and real-time capabilities (WebSocket, SSE)

2. **Module Interactions**: Depicts 9 domain modules with clear dependencies - Identity, Catalog, Vocab, Trainer, AI, Notification, Reminder, Media, and Platform domains

3. **Database ERD**: Complete entity-relationship diagram with 20+ tables showing User-centric design, vocab hierarchy, training system, mastery tracking, and reminder escalation chains

4. **Sequence Diagrams**: Four critical flows - vocab creation with AI translation, exam submission with mastery updates, sophisticated reminder escalation system, and mastery score calculation

All diagrams follow Clean Architecture principles with clear separation between Controllers, Services, and Repositories. The system is production-ready with robust error handling, quota management, and async processing.
