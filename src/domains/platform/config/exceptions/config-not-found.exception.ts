import { NotFoundException } from '@nestjs/common';

export class SystemConfigNotFoundException extends NotFoundException {
    public constructor(key: string) {
        super(`System config with key "${key}" not found`);
    }
}

export class UserConfigNotFoundException extends NotFoundException {
    public constructor(key: string) {
        super(`User config with key "${key}" not found`);
    }
}
