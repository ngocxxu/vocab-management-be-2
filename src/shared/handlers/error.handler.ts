import { BadRequestException } from '@nestjs/common';
import axios from 'axios';

/**
 * Maps axios rate-limit responses to a client-facing HTTP exception.
 * Use where axios errors must be normalized without Prisma-specific handling.
 */
export function throwIfAxiosRateLimited(error: unknown): void {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
        throw new BadRequestException('Rate limit exceeded. Please try again later.');
    }
}
