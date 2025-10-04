/* eslint-disable max-classes-per-file */
import * as Joi from 'joi';
import { JoiValidationPipe } from '../../common';
import {
    SignInInput,
    OAuthInput,
    RefreshTokenInput,
    ResetPasswordInput,
    VerifyOtpInput,
    ResendConfirmationInput,
    SignUpInput,
} from '../model';

export class SignUpPipe extends JoiValidationPipe {
    public buildSchema(): Joi.Schema {
        return Joi.object<SignUpInput>({
            email: Joi.string().email().required().messages({
                'string.empty': 'Email cannot be empty',
                'string.email': 'Please provide a valid email address',
                'any.required': 'Email is required',
            }),

            password: Joi.string().min(6).required().messages({
                'string.empty': 'Password cannot be empty',
                'string.min': 'Password must be at least 6 characters long',
                'any.required': 'Password is required',
            }),

            firstName: Joi.string().max(50).allow('', null).optional().messages({
                'string.max': 'First name cannot exceed 50 characters',
            }),

            lastName: Joi.string().max(50).allow('', null).optional().messages({
                'string.max': 'Last name cannot exceed 50 characters',
            }),

            phone: Joi.string()
                .pattern(/^[+]?[0-9\s\-()]+$/)
                .allow('', null)
                .optional()
                .messages({
                    'string.pattern.base': 'Please provide a valid phone number',
                }),

            avatar: Joi.string().uri().allow('', null).optional().messages({
                'string.uri': 'Avatar must be a valid URL',
            }),

            role: Joi.string().valid('CUSTOMER', 'ADMIN', 'STAFF').optional().messages({
                'any.only': 'Role must be one of: CUSTOMER, ADMIN, STAFF',
            }),
        });
    }
}

export class SignInPipe extends JoiValidationPipe {
    public buildSchema(): Joi.Schema {
        return Joi.object<SignInInput>({
            email: Joi.string().email().required().messages({
                'string.empty': 'Email cannot be empty',
                'string.email': 'Please provide a valid email address',
                'any.required': 'Email is required',
            }),

            password: Joi.string().required().messages({
                'string.empty': 'Password cannot be empty',
                'any.required': 'Password is required',
            }),
        });
    }
}

export class OAuthPipe extends JoiValidationPipe {
    public buildSchema(): Joi.Schema {
        return Joi.object<OAuthInput>({
            provider: Joi.string()
                .valid('google', 'github', 'facebook', 'apple')
                .required()
                .messages({
                    'any.only': 'Provider must be one of: google, github, facebook, apple',
                    'any.required': 'Provider is required',
                }),
        });
    }
}

export class RefreshTokenPipe extends JoiValidationPipe {
    public buildSchema(): Joi.Schema {
        return Joi.object<RefreshTokenInput>({
            refreshToken: Joi.string().required().messages({
                'string.empty': 'Refresh token cannot be empty',
                'any.required': 'Refresh token is required',
            }),
        });
    }
}

export class ResetPasswordPipe extends JoiValidationPipe {
    public buildSchema(): Joi.Schema {
        return Joi.object<ResetPasswordInput>({
            email: Joi.string().email().required().messages({
                'string.empty': 'Email cannot be empty',
                'string.email': 'Please provide a valid email address',
                'any.required': 'Email is required',
            }),
        });
    }
}

export class VerifyOtpPipe extends JoiValidationPipe {
    public buildSchema(): Joi.Schema {
        return Joi.object<VerifyOtpInput>({
            email: Joi.string().email().required().messages({
                'string.empty': 'Email cannot be empty',
                'string.email': 'Please provide a valid email address',
                'any.required': 'Email is required',
            }),

            token: Joi.string().required().messages({
                'string.empty': 'Token cannot be empty',
                'any.required': 'Token is required',
            }),

            type: Joi.string().valid('signup', 'recovery', 'email_change').required().messages({
                'any.only': 'Type must be one of: signup, recovery, email_change',
                'any.required': 'Type is required',
            }),
        });
    }
}

export class ResendConfirmationPipe extends JoiValidationPipe {
    public buildSchema(): Joi.Schema {
        return Joi.object<ResendConfirmationInput>({
            email: Joi.string().email().required().messages({
                'string.empty': 'Email cannot be empty',
                'string.email': 'Please provide a valid email address',
                'any.required': 'Email is required',
            }),
        });
    }
}
