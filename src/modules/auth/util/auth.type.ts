import { SessionDto } from '../model';

export type SignInResponse = {
    session: SessionDto;
    accessToken: string;
    refreshToken: string;
};