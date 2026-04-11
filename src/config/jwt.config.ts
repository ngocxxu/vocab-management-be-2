import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
    secret: process.env.JWT_SECRET as string,
    issuer: process.env.JWT_ISSUER as string,
}));
