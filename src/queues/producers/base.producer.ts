import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import { mergeJobOptions } from '../utils/merge-job-options';

export abstract class BaseProducer {
    protected constructor(
        protected readonly queue: Queue,
        private readonly defaultJobOptions: JobsOptions,
    ) {}

    protected mergeOpts(caller?: JobsOptions): JobsOptions {
        return mergeJobOptions(this.defaultJobOptions, caller);
    }

    public async addJob<T extends object>(
        name: string,
        data: T,
        opts?: JobsOptions,
    ): Promise<{ jobId: string }> {
        const job = await this.queue.add(name, data, this.mergeOpts(opts));
        return { jobId: job.id ?? '' };
    }

    public async addBulk<T extends object>(
        jobs: Array<{ name: string; data: T; opts?: JobsOptions }>,
    ): Promise<{ jobId: string }[]> {
        const bulkPayload = jobs.map((j) => ({
            name: j.name,
            data: j.data,
            opts: this.mergeOpts(j.opts),
        }));
        const created = await this.queue.addBulk(bulkPayload);
        return created.map((job) => ({ jobId: job.id ?? '' }));
    }

    public async scheduleJob<T extends object>(
        name: string,
        data: T,
        delayMs: number,
        opts?: JobsOptions,
    ): Promise<{ jobId: string }> {
        return this.addJob(name, data, { ...this.mergeOpts(opts), delay: delayMs });
    }
}
