import { registerAs } from '@nestjs/config';

export default registerAs('supabase', () => ({
    url: process.env.SUPABASE_URL as string,
    anonKey: process.env.SUPABASE_KEY as string,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
}));
