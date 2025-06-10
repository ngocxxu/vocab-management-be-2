import { UserRole } from '@prisma/client';
import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common';
import { UserInput } from '../model';

export class UserPipe extends JoiValidationPipe {
    public buildSchema(): Joi.Schema {
        return Joi.object<UserInput>({
            email: Joi.string().email().required().max(255).messages({
                'string.empty': 'Email cannot be empty',
                'string.email': 'Email must be a valid email address',
                'string.max': 'Email cannot exceed 255 characters',
                'any.required': 'Email is required',
            }),

            phone: Joi.string()
                .pattern(/^\+?[1-9]\d{1,14}$/)
                .optional()
                .allow(null, '')
                .messages({
                    'string.pattern.base': 'Phone number must be a valid international format',
                }),

            firstName: Joi.string().max(100).optional().allow(null, '').messages({
                'string.max': 'First name cannot exceed 100 characters',
            }),

            lastName: Joi.string().max(100).optional().allow(null, '').messages({
                'string.max': 'Last name cannot exceed 100 characters',
            }),

            avatar: Joi.string().uri().optional().allow(null, '').messages({
                'string.uri': 'Avatar must be a valid URL',
            }),

            role: Joi.string()
                .valid(...Object.values(UserRole))
                .required()
                .messages({
                    'any.only': `Role must be one of: ${Object.values(UserRole).join(', ')}`,
                    'any.required': 'Role is required',
                }),

            isActive: Joi.boolean().optional().default(true).messages({
                'boolean.base': 'isActive must be a boolean value',
            }),

            supabaseUserId: Joi.string().required().max(255).messages({
                'string.empty': 'Supabase user ID cannot be empty',
                'string.max': 'Supabase user ID cannot exceed 255 characters',
                'any.required': 'Supabase user ID is required',
            }),
        });
    }
}
