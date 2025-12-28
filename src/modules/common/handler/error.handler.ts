import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import axios from 'axios';

// Define context types for better type safety
export type ErrorContext =
    | 'find'
    | 'findOne'
    | 'create'
    | 'update'
    | 'delete'
    | 'findOneAndExam'
    | 'submitExam'
    | 'createBulk'
    | 'deleteBulk'
    | 'findRandom'
    | 'reorder'
    | 'registerToken'
    | 'unregisterToken'
    | 'getUserTokens'
    | 'getTokensForUsers'
    | 'findByUserId'
    | 'exportToCsv'
    | 'getSystemConfig'
    | 'getUserConfig'
    | 'getConfig'
    | 'setSystemConfig'
    | 'setUserConfig'
    | 'deleteSystemConfig'
    | 'submitFillInBlank'
    | 'deleteUserConfig'
    | 'getOrCreateMastery'
    | 'updateMastery'
    | 'saveHistory'
    | 'getSummary'
    | 'getMasteryBySubject'
    | 'getProgressOverTime'
    | 'getTopProblematicVocabs'
    | 'getMasteryDistribution';

// Define error mapping interface
interface PrismaErrorMapping {
    [key: string]:
        | {
              [context in ErrorContext]?: string;
          }
        | string;
}

export class PrismaErrorHandler {
    private static readonly defaultErrorMapping: PrismaErrorMapping = {
        P2002: 'Record already exists',
        P2025: {
            update: 'Record not found',
            delete: 'Record not found',
            findOne: 'Record not found',
            create: 'Related record not found',
            find: 'Record not found',
            findOneAndExam: 'Exam of vocab trainer not found',
            submitExam: 'Exam of vocab trainer not found',
            createBulk: 'One or more related entities not found (language, word type, or subject)',
            deleteBulk: 'One or more related entities not found (language, word type, or subject)',
            findRandom: 'One or more related entities not found (language, word type, or subject)',
            reorder: 'One or more related entities not found (language, word type, or subject)',
            registerToken: 'FCM token already registered for this user',
            unregisterToken: 'FCM token not found',
            getUserTokens: 'FCM token not found',
            getTokensForUsers: 'FCM token not found',
            findByUserId: 'Record not found',
            exportToCsv: 'Record not found',
            getSystemConfig: 'Config not found',
            getUserConfig: 'Config not found',
            getConfig: 'Config not found',
            setSystemConfig: 'Config creation failed',
            setUserConfig: 'Config creation failed',
            deleteSystemConfig: 'Config not found',
            deleteUserConfig: 'Config not found',
        },
        P2003: 'Foreign key constraint failed',
        P2014: 'Invalid ID provided',
        P2016: 'Query interpretation error',
    };

    /**
     * Handle Prisma errors and convert to appropriate NestJS exceptions
     */
    public static handle(
        error: unknown,
        context?: ErrorContext,
        customMapping?: PrismaErrorMapping,
    ): never {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            const errorMapping = { ...this.defaultErrorMapping, ...customMapping };
            const errorCode = error.code as keyof typeof errorMapping;
            const errorConfig = errorMapping[errorCode];

            if (errorConfig) {
                let message: string;

                if (typeof errorConfig === 'string') {
                    message = errorConfig;
                } else if (context) {
                    message = errorConfig[context] ?? 'An error occurred';
                } else {
                    message = 'An error occurred';
                }

                switch (error.code) {
                    case 'P2002':
                        throw new ConflictException(message);
                    case 'P2025':
                    case 'P2016':
                        throw new NotFoundException(message);
                    case 'P2003':
                    case 'P2014':
                        throw new ConflictException(message);
                    default:
                        throw new Error(message);
                }
            }
        }

        if (axios.isAxiosError(error)) {
            const statusCode = error.response?.status;
            if (statusCode === 429) {
                throw new BadRequestException('Rate limit exceeded. Please try again later.');
            }
            throw error;
        }

        if (error instanceof Error) {
            throw error;
        }

        throw new Error('An unexpected error occurred');
    }
}
