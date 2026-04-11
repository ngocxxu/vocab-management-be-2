import { SessionDto } from '../dto';

export type SignInResponse = {
    session: SessionDto;
    accessToken: string;
    refreshToken: string;
};