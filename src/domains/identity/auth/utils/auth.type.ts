import { SessionDto } from '../dto';

export type SignInResponse = {
    session: SessionDto;
    accessToken: string;
    refreshToken: string;
};

export type SignUpServiceResponse = {
    session: SessionDto | null;
    message: string | null;
};
