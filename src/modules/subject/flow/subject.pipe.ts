import { Injectable } from '@nestjs/common';
import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common/flow/joi-validation.pipe';

@Injectable()
export class SubjectPipe extends JoiValidationPipe {
    public buildSchema(): Joi.ObjectSchema {
        return Joi.object({
            name: Joi.string()
                .required()
                .max(100)
                .trim()
                .min(1)
                .pattern(/^[^\s].*[^\s]$|^[^\s]$/)
                .messages({
                    'string.pattern.base': 'Subject name cannot start or end with spaces',
                    'string.min': 'Subject name cannot be empty',
                    'string.max': 'Subject name cannot exceed 100 characters',
                    'string.empty': 'Subject name is required',
                    'any.required': 'Subject name is required',
                }),

            order: Joi.number().integer().min(0).required().messages({
                'number.base': 'Order must be a number',
                'number.integer': 'Order must be an integer',
                'number.min': 'Order must be greater than or equal to 0',
                'any.required': 'Order is required',
            }),
        });
    }
}
