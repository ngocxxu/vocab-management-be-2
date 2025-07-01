import { Injectable } from '@nestjs/common';
import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common/flow/joi-validation.pipe';

@Injectable()
export class LanguagePipe extends JoiValidationPipe {
    public buildSchema(): Joi.ObjectSchema {
        return Joi.object({
            code: Joi.string()
                .required()
                .max(10)
                .trim()
                .min(2)
                .pattern(/^[a-z]{2,3}(-[A-Z]{2})?$/)
                .messages({
                    'string.pattern.base':
                        'Language code must be in ISO format (e.g., en, en-US, zh-CN)',
                    'string.min': 'Language code must be at least 2 characters',
                    'string.max': 'Language code cannot exceed 10 characters',
                    'string.empty': 'Language code is required',
                    'any.required': 'Language code is required',
                }),

            name: Joi.string()
                .required()
                .max(100)
                .trim()
                .min(1)
                .pattern(/^[^\s].*[^\s]$|^[^\s]$/)
                .messages({
                    'string.pattern.base': 'Language name cannot start or end with spaces',
                    'string.min': 'Language name cannot be empty',
                    'string.max': 'Language name cannot exceed 100 characters',
                    'string.empty': 'Language name is required',
                    'any.required': 'Language name is required',
                }),
        });
    }
}
