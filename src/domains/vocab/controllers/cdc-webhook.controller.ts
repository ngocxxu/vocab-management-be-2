import { Public } from '@/shared/decorators';
import { Controller, ForbiddenException, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { VocabEmbeddingWorkerService } from '../services/vocab-embedding-worker.service';

/**
 * Receives change notifications from Sequin (Postgres CDC).
 *
 * The body is deliberately IGNORED. This endpoint carries exactly one bit of
 * information — "something changed, scan sooner" — and every decision about
 * *what* changed comes from the worker's own SQL comparison.
 *
 * That is what keeps CDC a pure latency optimisation with no correctness
 * responsibility: if Sequin is down or a webhook is lost, the worker's periodic
 * scan still finds the change. It also sidesteps the whole class of bugs around
 * parsing CDC payloads (insert vs update vs delete, old-row vs key tuples).
 */
@Controller('internal/cdc')
@ApiExcludeController()
export class CdcWebhookController {
    public constructor(private readonly worker: VocabEmbeddingWorkerService) {}

    @Post('vocab-changed')
    @Public()
    @HttpCode(HttpStatus.OK)
    public vocabChanged(@Headers('authorization') authorization: string | undefined): { ok: true } {
        this.assertAuthorized(authorization);

        // Returns immediately; the debounce inside requestWake() collapses a burst
        // (e.g. a 5,000-row CSV import) into a single scan.
        this.worker.requestWake();
        return { ok: true };
    }

    /**
     * Shared-secret check. Sequin sends it as an encrypted header configured on
     * the sink. Without a configured secret the endpoint refuses everything
     * rather than defaulting open — it can trigger work on the user's behalf.
     */
    private assertAuthorized(authorization: string | undefined): void {
        const expected = process.env.CDC_WEBHOOK_TOKEN;
        if (!expected || authorization !== `Bearer ${expected}`) {
            throw new ForbiddenException();
        }
    }
}
