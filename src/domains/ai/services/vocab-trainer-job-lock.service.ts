import { LoggerService, RedisKeyManager, RedisPrefix, RedisService } from '@/shared';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VOCAB_TRAINER_JOB_LOCK_TTL_SECONDS, VocabTrainerQueueName } from '../constants/vocab-trainer-job.constants';
import { AcquireResult, ActiveJobResponse, ActiveVocabTrainerJob, VocabTrainerJobType } from '../dto/active-vocab-trainer-job.dto';

@Injectable()
export class VocabTrainerJobLockService {
    private static readonly ACQUIRE_SCRIPT = `
local existing = redis.call("GET", KEYS[1])
if existing then
  return existing
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
return "OK"
`;

    private static readonly RELEASE_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  return -1
end
local data = cjson.decode(current)
if data["lockToken"] ~= ARGV[1] then
  return 0
end
return redis.call("DEL", KEYS[1])
`;

    private static readonly REFRESH_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  return 0
end
local data = cjson.decode(current)
if data["lockToken"] ~= ARGV[1] then
  return 0
end
data["attempt"] = tonumber(ARGV[3])
redis.call("SET", KEYS[1], cjson.encode(data), "EX", ARGV[2])
return 1
`;

    public constructor(
        private readonly redisService: RedisService,
        private readonly logger: LoggerService,
    ) {}

    public async acquireOrGetActive(userId: string, trainerId: string, queueName: VocabTrainerQueueName, jobType: VocabTrainerJobType, jobId: string): Promise<AcquireResult> {
        const lockKey = this.getLockKey(userId);
        const job: ActiveVocabTrainerJob = {
            jobId,
            lockToken: randomUUID(),
            queueName,
            trainerId,
            jobType,
            userId,
            createdAt: new Date().toISOString(),
            attempt: 0,
        };

        const result = await this.redisService.client.eval(VocabTrainerJobLockService.ACQUIRE_SCRIPT, 1, lockKey, JSON.stringify(job), String(VOCAB_TRAINER_JOB_LOCK_TTL_SECONDS));

        if (result === 'OK') {
            return { acquired: true, job };
        }

        return { acquired: false, activeJob: this.parseJob(result) };
    }

    public async getActiveJob(userId: string): Promise<ActiveVocabTrainerJob | null> {
        const current = await this.redisService.client.get(this.getLockKey(userId));
        return current ? this.parseJob(current) : null;
    }

    public async isOwner(userId: string, jobId: string, lockToken: string): Promise<boolean> {
        const current = await this.getActiveJob(userId);
        return current?.jobId === jobId && current.lockToken === lockToken;
    }

    public async refreshLock(userId: string, lockToken: string, attempt: number): Promise<boolean> {
        const result = await this.redisService.client.eval(
            VocabTrainerJobLockService.REFRESH_SCRIPT,
            1,
            this.getLockKey(userId),
            lockToken,
            String(VOCAB_TRAINER_JOB_LOCK_TTL_SECONDS),
            String(attempt),
        );
        return Number(result) === 1;
    }

    public async releaseIfOwned(userId: string, lockToken: string): Promise<boolean> {
        const result = await this.redisService.client.eval(VocabTrainerJobLockService.RELEASE_SCRIPT, 1, this.getLockKey(userId), lockToken);
        return Number(result) === 1 || Number(result) === -1;
    }

    public toResponse(job: ActiveVocabTrainerJob): ActiveJobResponse {
        return {
            jobId: job.jobId,
            queueName: job.queueName,
            trainerId: job.trainerId,
            jobType: job.jobType,
            createdAt: job.createdAt,
        };
    }

    private getLockKey(userId: string): string {
        return RedisKeyManager.generateKey(RedisPrefix.LOCK, 'vocab-trainer', 'user', userId);
    }

    private parseJob(raw: unknown): ActiveVocabTrainerJob {
        if (typeof raw !== 'string') {
            this.logger.error(`Invalid active vocab trainer job payload: ${String(raw)}`);
            throw new Error('Invalid active vocab trainer job payload');
        }

        return JSON.parse(raw) as ActiveVocabTrainerJob;
    }
}
