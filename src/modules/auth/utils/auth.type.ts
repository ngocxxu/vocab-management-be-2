import { SessionDto } from '../models';

export type SignInResponse = {
    session: SessionDto;
    accessToken: string;
    refreshToken: string;
};