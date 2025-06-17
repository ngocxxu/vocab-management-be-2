import { User } from '@supabase/supabase-js';
import { FastifyRequest } from 'fastify';

export interface RequestWithUser extends FastifyRequest {
    user: User;
}
