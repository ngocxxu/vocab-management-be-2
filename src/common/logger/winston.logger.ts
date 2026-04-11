import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';

@Injectable()
export class WinstonLogger implements NestLoggerService {
    private readonly logger: winston.Logger;

    public constructor() {
        const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
        const isTest = process.env.NODE_ENV === 'test';

        const format = isProduction
            ? winston.format.combine(winston.format.timestamp(), winston.format.json())
            : winston.format.combine(winston.format.colorize(), winston.format.simple());

        this.logger = winston.createLogger({
            level: 'info',
            silent: isTest,
            format,
            transports: [
                new winston.transports.Console({
                    stderrLevels: ['error'],
                }),
            ],
        });
    }

    public log(message: unknown, context?: string): void {
        this.logger.info(this.formatContext(message, context));
    }

    public error(message: unknown, trace?: string, context?: string): void {
        const line = this.formatContext(message, context);
        this.logger.error(trace ? `${line}\n${trace}` : line);
    }

    public warn(message: unknown, context?: string): void {
        this.logger.warn(this.formatContext(message, context));
    }

    public debug(message: unknown, context?: string): void {
        this.logger.debug(this.formatContext(message, context));
    }

    public verbose(message: unknown, context?: string): void {
        this.logger.verbose(this.formatContext(message, context));
    }

    public info(message: string): void {
        this.logger.info(message);
    }

    public logError(message: string, stack?: string, meta?: Record<string, unknown>): void {
        this.logger.error({
            message,
            ...(stack ? { stack } : {}),
            ...meta,
        });
    }

    public logWarn(message: string, meta?: Record<string, unknown>): void {
        this.logger.warn({ message, ...meta });
    }

    private formatContext(message: unknown, context?: string): string {
        const text = typeof message === 'string' ? message : JSON.stringify(message);
        return context ? `[${context}] ${text}` : text;
    }
}
