import { Global, Module } from '@nestjs/common';

import { SupabaseAuthProvider } from './supabase-auth.provider';
import { SupabaseStorageProvider } from './supabase-storage.provider';

@Global()
@Module({
    providers: [SupabaseAuthProvider, SupabaseStorageProvider],
    exports: [SupabaseAuthProvider, SupabaseStorageProvider],
})
export class SupabaseModule {}
