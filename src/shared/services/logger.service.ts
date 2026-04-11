import { WinstonLogger } from '@/common/logger/winston.logger';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LoggerService {
    public constructor(private readonly winston: WinstonLogger) {}

    public info(message: string): void {
        this.winston.info(message);
    }

    public error(message: string): void {
        this.winston.error(message);
    }

    public warn(message: string): void {
        this.winston.warn(message);
    }

    public debug(message: string): void {
        this.winston.debug(message);
    }
}
