import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseStorageProvider {
    private readonly client: SupabaseClient;

    public constructor(private readonly configService: ConfigService) {
        const url = this.configService.getOrThrow<string>('supabase.url');
        const key = this.configService.getOrThrow<string>('supabase.serviceRoleKey');
        this.client = createClient(url, key);
    }

    public async upload(bucket: string, path: string, data: Buffer, contentType?: string): Promise<void> {
        const { error } = await this.client.storage.from(bucket).upload(path, data, {
            contentType,
            upsert: true,
        });
        if (error) {
            throw error;
        }
    }

    public async remove(bucket: string, paths: string[]): Promise<void> {
        const { error } = await this.client.storage.from(bucket).remove(paths);
        if (error) {
            throw error;
        }
    }

    public getPublicUrl(bucket: string, path: string): string {
        const { data } = this.client.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    }
}
