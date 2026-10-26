import { NotFoundException } from '@nestjs/common';

/** MCP is switched off: the endpoint and its metadata do not exist. */
export class McpNotFoundException extends NotFoundException {
    public constructor() {
        super();
    }
}
