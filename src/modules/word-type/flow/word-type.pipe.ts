import { Injectable } from '@nestjs/common';
import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common/flow/joi-validation.pipe';

@Injectable()
export class WordTypePipe extends JoiValidationPipe {
    public buildSchema(): Joi.ObjectSchema {
        return Joi.object({
            name: Joi.string()
                .required()
                .max(100)
                .trim()
                .min(1)
                .pattern(/^[^\s].*[^\s]$|^[^\s]$/)
                .messages({
                    'string.pattern.base': 'Word type name cannot start or end with spaces',
                    'string.min': 'Word type name cannot be empty',
                    'string.max': 'Word type name cannot exceed 100 characters',
                    'string.empty': 'Word type name is required',
                    'any.required': 'Word type name is required',
                }),

            description: Joi.string()
                .required()
                .max(500)
                .trim()
                .min(1)
                .pattern(/^[^\s].*[^\s]$|^[^\s]$/)
                .messages({
                    'string.pattern.base': 'Description cannot start or end with spaces',
                    'string.min': 'Description cannot be empty',
                    'string.max': 'Description cannot exceed 500 characters',
                    'string.empty': 'Description is required',
                    'any.required': 'Description is required',
                }),
        });
    }
}
