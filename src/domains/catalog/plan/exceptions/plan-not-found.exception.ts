import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export class PlanNotFoundException extends NotFoundException {
    public constructor(role: UserRole) {
        super(`Plan with role ${role} not found`);
    }
}
