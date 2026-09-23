import { registerAs } from '@nestjs/config';

export default registerAs('qdrant', () => ({
    url: process.env.QDRANT_URL as string,
    apiKey: process.env.QDRANT_API_KEY as string,
}));
