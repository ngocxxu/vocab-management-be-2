import { Injectable } from '@nestjs/common';
import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common/flow/joi-validation.pipe';

@Injectable()
export class VocabPipe extends JoiValidationPipe {
    public buildSchema(): Joi.ObjectSchema {
        return Joi.object({
            textSource: Joi.string()
                .required()
                .max(255)
                .trim()
                .min(1)
                .pattern(/^[^\s].*[^\s]$|^[^\s]$/)
                .messages({
                    'string.pattern.base': 'Text source cannot start or end with spaces',
                }),

            sourceLanguageId: Joi.string()
                .required()
                .pattern(/^cl[a-zA-Z0-9]{24}$/)
                .messages({
                    'string.pattern.base': 'Invalid source language ID format',
                }),

            targetLanguageId: Joi.string()
                .required()
                .pattern(/^cl[a-zA-Z0-9]{24}$/)
                .invalid(Joi.ref('sourceLanguageId'))
                .messages({
                    'string.pattern.base': 'Invalid target language ID format',
                    'any.invalid': 'Target language must be different from source language',
                }),

            textTargets: Joi.array()
                .items(
                    Joi.object({
                        wordTypeId: Joi.string()
                            .optional()
                            .pattern(/^cl[a-zA-Z0-9]{24}$/)
                            .messages({
                                'string.pattern.base': 'Invalid word type ID format',
                            }),

                        textTarget: Joi.string().required().max(500).trim().min(1).messages({
                            'string.empty': 'Text target is required',
                            'string.min': 'Text target cannot be empty',
                            'string.max': 'Text target cannot exceed 500 characters',
                            'any.required': 'Text target is required',
                        }),

                        grammar: Joi.string().optional().max(100).trim().min(1).messages({
                            'string.min': 'Grammar cannot be empty if provided',
                            'string.max': 'Grammar cannot exceed 100 characters',
                        }),

                        explanationSource: Joi.string()
                            .optional()
                            .max(1000)
                            .trim()
                            .min(1)
                            .messages({
                                'string.min': 'Source explanation cannot be empty if provided',
                                'string.max': 'Source explanation cannot exceed 1000 characters',
                            }),

                        explanationTarget: Joi.string()
                            .optional()
                            .max(1000)
                            .trim()
                            .min(1)
                            .messages({
                                'string.min': 'Target explanation cannot be empty if provided',
                                'string.max': 'Target explanation cannot exceed 1000 characters',
                            }),

                        subjectIds: Joi.array()
                            .items(
                                Joi.string()
                                    .pattern(/^cl[a-zA-Z0-9]{24}$/)
                                    .messages({
                                        'string.pattern.base': 'Invalid subject ID format',
                                    }),
                            )
                            .required()
                            .unique()
                            .min(1)
                            .messages({
                                'array.min': 'At least one subject ID is required',
                                'array.unique': 'Subject IDs must be unique',
                                'any.required': 'Subject IDs are required',
                            }),

                        vocabExamples: Joi.array()
                            .items(
                                Joi.object({
                                    source: Joi.string()
                                        .required()
                                        .max(1000)
                                        .trim()
                                        .min(1)
                                        .messages({
                                            'string.empty': 'Example source is required',
                                            'string.min': 'Example source cannot be empty',
                                            'string.max':
                                                'Example source cannot exceed 1000 characters',
                                            'any.required': 'Example source is required',
                                        }),
                                    target: Joi.string()
                                        .required()
                                        .max(1000)
                                        .trim()
                                        .min(1)
                                        .messages({
                                            'string.empty': 'Example target is required',
                                            'string.min': 'Example target cannot be empty',
                                            'string.max':
                                                'Example target cannot exceed 1000 characters',
                                            'any.required': 'Example target is required',
                                        }),
                                }).messages({
                                    'object.base':
                                        'Each example must be a valid object with source and target',
                                }),
                            )
                            .optional()
                            .messages({
                                'array.base': 'Examples must be an array',
                            }),
                    }).messages({
                        'object.base': 'Each text target must be a valid object',
                    }),
                )
                .required()
                .min(1)
                .messages({
                    'array.base': 'Text targets must be an array',
                    'array.min': 'At least one text target is required',
                    'any.required': 'Text targets are required',
                }),
        });
    }
}
