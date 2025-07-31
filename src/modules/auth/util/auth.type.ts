import { SessionDto } from '../model';

export type SignInResponse = {
    session: SessionDto;
    refreshToken: string;
};