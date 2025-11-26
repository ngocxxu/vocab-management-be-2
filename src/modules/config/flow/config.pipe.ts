import { Inject, Injectable, PipeTransform } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as Joi from 'joi';
import { DEFAULT_MODEL_FALLBACK_ORDER } from '../../ai/service/ai.service';
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

        if (key === 'ai.model') {
            return baseSchema.keys({
                value: Joi.string()
                    .valid(...DEFAULT_MODEL_FALLBACK_ORDER)
                    .required()
                    .messages({
                        'string.base': 'AI model must be a string',
                        'any.required': 'AI model is required',
                        'any.only': `Model name must be one of: ${DEFAULT_MODEL_FALLBACK_ORDER.join(', ')}`,
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
