import type { Job, JobOptions, Queue } from 'bull';
import { mergeJobOptions } from '../utils/merge-job-options';

export abstract class BaseProducer {
    protected constructor(
        protected readonly queue: Queue,
        private readonly defaultJobOptions: JobOptions,
    ) {}

    public async addJob<T extends object>(name: string, data: T, opts?: JobOptions): Promise<{ jobId: string }> {
        const job = await this.queue.add(name, data, this.mergeOpts(opts));
        return { jobId: String(job.id ?? '') };
    }

    public async addBulk<T extends object>(jobs: Array<{ name: string; data: T; opts?: JobOptions }>): Promise<{ jobId: string }[]> {
        const bulkPayload = jobs.map((j) => ({
            name: j.name,
            data: j.data,
            opts: this.mergeOpts(j.opts),
        }));
        const created = await this.queue.addBulk(bulkPayload);
        return created.map((job) => ({ jobId: String(job.id ?? '') }));
    }

    public async scheduleJob<T extends object>(name: string, data: T, delayMs: number, opts?: JobOptions): Promise<{ jobId: string }> {
        return this.addJob(name, data, { ...this.mergeOpts(opts), delay: delayMs });
    }

    public async getJob(jobId: string): Promise<Job | undefined> {
        return (await this.queue.getJob(jobId)) as Job | undefined;
    }

    protected mergeOpts(caller?: JobOptions): JobOptions {
        return mergeJobOptions(this.defaultJobOptions, caller);
    }
}
