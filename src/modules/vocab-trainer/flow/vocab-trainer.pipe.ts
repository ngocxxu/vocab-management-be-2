import { Injectable } from '@nestjs/common';
import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common/flow/joi-validation.pipe';

@Injectable()
export class VocabTrainerPipe extends JoiValidationPipe {
    public buildSchema(): Joi.ObjectSchema {
        return Joi.object({
            name: Joi.string().required().max(255).trim().min(1).messages({
                'string.empty': 'Name is required',
                'string.min': 'Name cannot be empty',
                'string.max': 'Name cannot exceed 255 characters',
                'any.required': 'Name is required',
            }),
            status: Joi.string().required().valid(
                'PENDING',
                'IN_PROCESS',
                'COMPLETED',
                'CANCELLED',
                'FAILED',
                'PASSED',
            ).messages({
                'any.only': 'Invalid status',
                'any.required': 'Status is required',
            }),
            reminderTime: Joi.number().integer().min(0).optional(),
            countTime: Joi.number().integer().min(0).optional(),
            setCountTime: Joi.number().integer().min(0).optional(),
            reminderDisabled: Joi.boolean().optional(),
            reminderRepeat: Joi.number().integer().min(0).optional(),
            reminderLastRemind: Joi.date().optional(),
        });
    }
}