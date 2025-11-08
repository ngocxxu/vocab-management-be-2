import { Inject, Injectable, PipeTransform } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common';
import { ConfigInput } from '../model';

const ALLOWED_MODEL_NAMES = [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash-exp',
    'gemini-2.5-pro',
    'learnlm-2.0-flash-experimental',
] as const;

@Injectable()
export class ConfigPipe extends JoiValidationPipe implements PipeTransform<unknown, ConfigInput> {
    public constructor(@Inject(REQUEST) private readonly request: { params: { key: string } }) {
        super();
    }

    public buildSchema(): Joi.Schema {
        const key = this.request?.params?.key;

        const baseSchema = Joi.object<ConfigInput>({
            value: Joi.any().required().messages({
                'any.required': 'Config value is required',
            }),
        });

        if (key === 'ai.model') {
            return baseSchema.keys({
                value: Joi.string()
                    .valid(...ALLOWED_MODEL_NAMES)
                    .required()
                    .messages({
                        'string.base': 'AI model must be a string',
                        'any.required': 'AI model is required',
                        'any.only': `Model name must be one of: ${ALLOWED_MODEL_NAMES.join(', ')}`,
                    }),
            });
        }

        return baseSchema;
    }

    public transform(value: unknown): ConfigInput {
        const transformed = super.transform(value) as { value: unknown };
        return {
            value: transformed.value as Prisma.InputJsonValue,
        };
    }
}
