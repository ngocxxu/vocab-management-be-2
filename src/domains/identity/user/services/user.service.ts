import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { IResponse } from '@/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Auth0ManagementService } from '../../auth0-management';
import { UserDto, UserInput } from '../dto';
import { UserBadRequestException, UserNotFoundException, UserNotFoundInDatabaseException } from '../exceptions';
import { UserIdentityRepository, UserRepository } from '../repositories';

@Injectable()
export class UserService {
    public constructor(
        private readonly userRepository: UserRepository,
        private readonly supabaseAuth: SupabaseAuthProvider,
        private readonly userIdentityRepository: UserIdentityRepository,
        private readonly auth0Management: Auth0ManagementService,
    ) {}

    private get supabase() {
        return this.supabaseAuth.getServiceRoleClient();
    }

    public async find(): Promise<IResponse<UserDto[]>> {
        const users = await this.userRepository.findAll();

        return {
            items: users.map((user) => new UserDto({ ...user })),
            statusCode: HttpStatus.OK,
        };
    }

    public async findOne(supabaseUserId: string): Promise<UserDto> {
        const user = await this.userRepository.findBySupabaseUserId(supabaseUserId);

        if (!user) {
            throw new UserNotFoundException(supabaseUserId);
        }

        return new UserDto({ ...user });
    }

    public async create(createUserData: UserInput): Promise<UserDto> {
        const { email, firstName, lastName, phone, avatar, role, password } = createUserData;
        if (!password) {
            throw new UserBadRequestException('Password is required');
        }

        const { data, error } = await this.supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            throw new UserBadRequestException(`Supabase create error: ${error.message}`);
        }
        if (!data.user) {
            throw new UserBadRequestException('User data is missing from Supabase response');
        }

        const supabaseUser = data.user;
        const user = await this.userRepository.create({
            email: email ?? supabaseUser.email,
            supabaseUserId: supabaseUser.id,
            firstName,
            lastName,
            phone: phone ?? supabaseUser.phone,
            avatar,
            role: role ?? UserRole.MEMBER,
            isActive: true,
        });

        return new UserDto({
            ...user,
        });
    }

    public async update(updateUserData: UserInput): Promise<UserDto> {
        const { id, email, firstName, lastName, phone, avatar, role, isActive, password } = updateUserData;

        if (!id) {
            throw new UserBadRequestException('Supabase user ID is required for update');
        }

        const existingUser = await this.userRepository.findById(id);

        if (!existingUser) {
            throw new UserBadRequestException('User not found');
        }

        // Auth0 owns credentials and the login email, so neither can be changed through this endpoint.
        if (password) {
            throw new UserBadRequestException('Passwords are managed by Auth0');
        }
        if (email && email !== existingUser.email) {
            throw new UserBadRequestException('The email is managed by Auth0');
        }

        const updateData = {
            ...(email !== undefined && { email }),
            ...(firstName !== undefined && { firstName }),
            ...(lastName !== undefined && { lastName }),
            ...(phone !== undefined && { phone }),
            ...(avatar !== undefined && { avatar }),
            ...(role !== undefined && { role }),
            ...(isActive !== undefined && { isActive }),
        };

        const user = await this.userRepository.update(id, updateData);

        return new UserDto({
            ...user,
        });
    }

    public async deleteSelf(id: string): Promise<UserDto> {
        const existingUser = await this.userRepository.findById(id);
        if (!existingUser) {
            throw new UserNotFoundInDatabaseException();
        }

        const user = await this.userRepository.update(id, { isActive: false });

        return new UserDto({ ...user });
    }

    public async delete(id: string): Promise<UserDto> {
        const existingUser = await this.userRepository.findById(id);
        if (!existingUser) {
            throw new UserNotFoundInDatabaseException();
        }

        // Read first: the Identity rows cascade away with the user.
        const identities = await this.userIdentityRepository.findByUserId(id);
        const user = await this.userRepository.delete(id);

        // Best-effort and after the delete, so an outage at either provider can never block it.
        await Promise.all([this.supabaseAuth.deleteUserBestEffort(id, existingUser.supabaseUserId), this.auth0Management.deleteIdentities(id, identities)]);

        return new UserDto({ ...user });
    }
}
