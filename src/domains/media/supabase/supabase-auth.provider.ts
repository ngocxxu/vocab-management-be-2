import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseAuthProvider {
    private anonClientSingleton?: SupabaseClient;
    private serviceRoleSingleton?: SupabaseClient;

    public constructor(private readonly configService: ConfigService) {}

    public getAnonClient(): SupabaseClient {
        if (!this.anonClientSingleton) {
            this.anonClientSingleton = createClient(this.configService.getOrThrow<string>('supabase.url'), this.configService.getOrThrow<string>('supabase.anonKey'));
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

    public createClientWithAccessToken(accessToken: string): SupabaseClient {
        return createClient(this.configService.getOrThrow<string>('supabase.url'), this.configService.getOrThrow<string>('supabase.anonKey'), {
            global: {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        });
    }
}
