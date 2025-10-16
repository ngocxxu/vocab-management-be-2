import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class HealthGuard implements CanActivate {

    public canActivate(context: ExecutionContext): boolean {

        const request = context.switchToHttp().getRequest<Request>();
        return request.headers.authorization === `Bearer ${process.env.HEALTH_TOKEN}`;
    }
}
