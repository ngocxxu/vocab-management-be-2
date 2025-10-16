import { User as CurrentUser } from '@prisma/client';
import { User } from '@supabase/supabase-js';
import { Request } from 'express';

export interface RequestWithUser extends Request {
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
