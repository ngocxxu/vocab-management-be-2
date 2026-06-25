import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
    apiKey: process.env.RESEND_API_KEY as string,
}));
