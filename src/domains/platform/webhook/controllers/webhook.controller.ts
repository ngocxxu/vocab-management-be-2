import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/shared/decorators';

@Controller('webhook')
@ApiTags('webhook')
export class WebhookController {
    @Get()
    @Public()
    @ApiOperation({ summary: 'Webhook module health' })
    @ApiResponse({ status: HttpStatus.OK })
    public getStatus(): { ok: boolean } {
        return { ok: true };
    }
}
