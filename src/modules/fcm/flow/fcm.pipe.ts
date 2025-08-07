import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ObjectSchema } from 'joi';
import { RegisterFcmTokenInput, UnregisterFcmTokenInput } from '../model';

@Injectable()
export class FcmPipe implements PipeTransform {
    public constructor(private readonly schema: ObjectSchema) {}

    public transform(value: unknown): RegisterFcmTokenInput | UnregisterFcmTokenInput {
        const { error } = this.schema.validate(value);
        if (error) {
            throw new BadRequestException('Validation failed');
        }
        return value as RegisterFcmTokenInput | UnregisterFcmTokenInput;
    }
}
