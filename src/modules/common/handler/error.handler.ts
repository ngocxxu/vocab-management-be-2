import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
    | 'findRandom';

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

        // Handle other types of errors
        if (error instanceof Error) {
            throw new Error(`Database operation failed: ${error.message}`);
        }

        throw new Error('An unexpected error occurred');
    }
}
