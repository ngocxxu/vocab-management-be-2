import { captureSentryException } from '@/shared/utils/sentry.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CLEANUP_TIMEOUT_MS = 5_000;

@Injectable()
export class SupabaseAuthProvider {
    private anonClientSingleton?: SupabaseClient;
    private serviceRoleSingleton?: SupabaseClient;

    public constructor(private readonly configService: ConfigService) {}

    public getAnonClient(): SupabaseClient {
        if (!this.anonClientSingleton) {
            this.anonClientSingleton = createClient(this.configService.getOrThrow<string>('supabase.url'), this.configService.getOrThrow<string>('supabase.anonKey'), {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            });
        }
        return this.anonClientSingleton;
    }

    public getServiceRoleClient(): SupabaseClient {
        if (!this.serviceRoleSingleton) {
            this.serviceRoleSingleton = createClient(this.configService.getOrThrow<string>('supabase.url'), this.configService.getOrThrow<string>('supabase.serviceRoleKey'), {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            });
        }
        return this.serviceRoleSingleton;
    }

    /**
     * Deletes a user's Supabase account after their local row is already gone. Best-effort: never throws and gives up
     * after a few seconds, so a Supabase outage cannot block or slow a delete. A failure is captured with the local
     * user id so the leftover account can be removed by hand. A user without a Supabase account, or one that is
     * already gone (404), needs nothing.
     */
    public async deleteUserBestEffort(localUserId: string, supabaseUserId: string | null): Promise<void> {
        if (!supabaseUserId) {
            return;
        }
        let timer: NodeJS.Timeout | undefined;
        try {
            const timeout = new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`Supabase delete timed out after ${CLEANUP_TIMEOUT_MS}ms`)), CLEANUP_TIMEOUT_MS);
            });
            const { error } = await Promise.race([this.getServiceRoleClient().auth.admin.deleteUser(supabaseUserId), timeout]);
            if (error && error.status !== HttpStatus.NOT_FOUND) {
                throw error;
            }
        } catch (error: unknown) {
            captureSentryException(error, { tags: { area: 'supabase_delete' }, contexts: { supabaseCleanup: { userId: localUserId } } });
        } finally {
            clearTimeout(timer);
        }
    }

    public createClientWithAccessToken(accessToken: string): SupabaseClient {
        return createClient(this.configService.getOrThrow<string>('supabase.url'), this.configService.getOrThrow<string>('supabase.anonKey'), {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        });
    }
}
