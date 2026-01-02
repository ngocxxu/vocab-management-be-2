import { applyDecorators } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ExcludeFromSwaggerIf = (condition: boolean) => {
    const noOp = (): void => {
        // No operation when condition is false
    };
    return applyDecorators(condition ? ApiExcludeEndpoint() : noOp);
};
