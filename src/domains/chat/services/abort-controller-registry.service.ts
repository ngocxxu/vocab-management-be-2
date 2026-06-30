import { Injectable } from '@nestjs/common';

@Injectable()
export class AbortControllerRegistry {
    private readonly controllers = new Map<string, AbortController>();

    public create(userId: string): AbortSignal {
        this.controllers.get(userId)?.abort();
        const controller = new AbortController();
        this.controllers.set(userId, controller);
        return controller.signal;
    }

    public abort(userId: string): void {
        this.controllers.get(userId)?.abort();
    }

    public delete(userId: string): void {
        this.controllers.delete(userId);
    }
}
