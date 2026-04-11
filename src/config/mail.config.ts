import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
    user: process.env.EMAIL_USER as string,
    password: process.env.EMAIL_PASSWORD as string,
}));
