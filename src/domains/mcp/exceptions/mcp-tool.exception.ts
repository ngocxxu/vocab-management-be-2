import { McpErrorCode } from '../constants';

/** A failure a tool reports to the client with a stable code. The message is for the model and must not carry database details. */
export class McpToolException extends Error {
    public constructor(
        public readonly code: McpErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'McpToolException';
    }
}
