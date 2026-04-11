import { PickType } from '@nestjs/swagger';
import { FcmTokenDto } from './fcm.dto';

export class UnregisterFcmTokenInput extends PickType(FcmTokenDto, ['fcmToken'] as const) {}
