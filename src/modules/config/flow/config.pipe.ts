import { Inject, Injectable, PipeTransform } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common';
import { ConfigInput } from '../model';

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
            return baseSchema.keys({
                value: Joi.string().valid('gemini', 'openrouter').required().messages({
                    'string.base': 'AI provider must be a string',
                    'any.required': 'AI provider is required',
                    'any.only': 'AI provider must be either "gemini" or "openrouter"',
                }),
            });
        }

        if (key === 'ai.model') {
            return baseSchema.keys({
                value: Joi.string().required().messages({
                    'string.base': 'AI model must be a string',
                    'any.required': 'AI model is required',
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
