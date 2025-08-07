import { PickType } from '@nestjs/swagger';
import { FcmTokenDto } from './fcm.dto';

export class RegisterFcmTokenInput extends PickType(FcmTokenDto, [
    'fcmToken',
    'deviceType',
] as const) {}
