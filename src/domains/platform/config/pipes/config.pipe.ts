import { JoiValidationPipe } from '@/shared';
import { Inject, Injectable, PipeTransform } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as Joi from 'joi';
import { ConfigInput } from '../dto';

const AI_PROVIDER_VALUES = ['gemini', 'openrouter', 'groq', 'omniroute'] as const;

// One validator for every AI provider key, so the allowed list has a single source. The label names the key in each message.
const aiProviderValue = (label: string): Joi.StringSchema =>
    Joi.string()
        .valid(...AI_PROVIDER_VALUES)
        .required()
        .messages({
            'string.base': `${label} must be a string`,
            'any.required': `${label} is required`,
            'any.only': `${label} must be one of: "gemini", "openrouter", "groq", or "omniroute"`,
        });

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

        if (key === 'ai.provider') {
            return baseSchema.keys({ value: aiProviderValue('AI provider') });
        }

        if (key === 'ai.model') {
            return baseSchema.keys({
                value: Joi.string().required().messages({
                    'string.base': 'AI model must be a string',
                    'any.required': 'AI model is required',
                }),
            });
        }

        if (key === 'ai.chat.provider') {
            return baseSchema.keys({ value: aiProviderValue('AI chat provider') });
        }

        if (key === 'ai.audio.provider') {
            return baseSchema.keys({ value: aiProviderValue('AI audio provider') });
        }

        if (key === 'ai.audio.model') {
            return baseSchema.keys({
                value: Joi.string().required().messages({
                    'string.base': 'AI audio model must be a string',
                    'any.required': 'AI audio model is required',
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
