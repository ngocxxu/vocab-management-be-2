import { MethodNotAllowedException } from '@nestjs/common';

export class McpMethodNotAllowedException extends MethodNotAllowedException {
    public constructor() {
        super();
    }
}
