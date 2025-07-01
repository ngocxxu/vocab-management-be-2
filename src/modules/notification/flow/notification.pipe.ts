import { Injectable } from '@nestjs/common';
import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common/flow/joi-validation.pipe';

@Injectable()
export class NotificationPipe extends JoiValidationPipe {
    public buildSchema(): Joi.ObjectSchema {
        return Joi.object({
            type: Joi.string()
                .required()
                .valid('SYSTEM', 'USER', 'ADMIN', 'MARKETING', 'SECURITY')
                .messages({
                    'any.only': 'Type must be one of: SYSTEM, USER, ADMIN, MARKETING, SECURITY',
                    'any.required': 'Notification type is required',
                }),

            action: Joi.string()
                .required()
                .valid('CREATE', 'UPDATE', 'DELETE', 'REMINDER', 'ALERT', 'INFO')
                .messages({
                    'any.only':
                        'Action must be one of: CREATE, UPDATE, DELETE, REMINDER, ALERT, INFO',
                    'any.required': 'Notification action is required',
                }),

            priority: Joi.string().required().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').messages({
                'any.only': 'Priority must be one of: LOW, MEDIUM, HIGH, URGENT',
                'any.required': 'Priority is required',
            }),

            data: Joi.object().required().messages({
                'object.base': 'Data must be a valid JSON object',
                'any.required': 'Notification data is required',
            }),

            isActive: Joi.boolean().optional().default(true).messages({
                'boolean.base': 'isActive must be a boolean value',
            }),

            expiresAt: Joi.date().required().greater('now').messages({
                'date.base': 'Expires at must be a valid date',
                'date.greater': 'Expires at must be in the future',
                'any.required': 'Expiration date is required',
            }),

            recipientUserIds: Joi.array()
                .items(
                    Joi.string()
                        .pattern(/^[a-zA-Z0-9]{25}$/)
                        .messages({
                            'string.pattern.base': 'Invalid user ID format',
                        }),
                )
                .required()
                .min(1)
                .unique()
                .messages({
                    'array.min': 'At least one recipient is required',
                    'array.unique': 'Recipient user IDs must be unique',
                    'any.required': 'Recipients are required',
                }),
        });
    }
}
