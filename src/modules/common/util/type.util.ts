import { User as CurrentUser } from '@prisma/client';
import { User } from '@supabase/supabase-js';
import { FastifyRequest } from 'fastify';

export interface RequestWithUser extends FastifyRequest {
    user: User;
    currentUser: CurrentUser;
}

export interface TemplateData {
    [key: string]: string | number;
}

export interface IResponse<T> {
    items: T;
    message?: string;
    statusCode?: number;
}