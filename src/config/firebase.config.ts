import { registerAs } from '@nestjs/config';

export default registerAs('firebase', () => ({
    projectId: process.env.FCM_PROJECT_ID as string,
    clientEmail: process.env.FCM_CLIENT_EMAIL as string,
    privateKey: process.env.FCM_PRIVATE_KEY as string,
}));
