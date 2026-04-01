export interface ActedCheckStrategy {
    readonly entityType: string;
    hasActedSince(entityId: string, since: Date): Promise<boolean>;
}
