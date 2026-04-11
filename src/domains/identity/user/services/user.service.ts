import { SupabaseAuthProvider } from '@/domains/media/supabase';
import { IResponse } from '@/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UserDto, UserInput } from '../dto';
import { UserBadRequestException, UserNotFoundException, UserNotFoundInDatabaseException } from '../exceptions';
import { UserRepository } from '../repositories';

@Injectable()
export class UserService {
    public constructor(
        private readonly userRepository: UserRepository,
        private readonly supabaseAuth: SupabaseAuthProvider,
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

        if (password) {
            const { error } = await this.supabase.auth.admin.updateUserById(existingUser.supabaseUserId ?? '', {
                password,
            });
            if (error) {
                throw new UserBadRequestException(`Supabase update password error: ${error.message}`);
            }
        }

        if (email && email !== existingUser.email) {
            const { error } = await this.supabase.auth.admin.updateUserById(existingUser.supabaseUserId ?? '', {
                email,
            });

            if (error) {
                throw new UserBadRequestException(`Supabase update email error: ${error.message}`);
            }
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

    public async delete(id: string): Promise<UserDto> {
        const existingUser = await this.userRepository.findById(id);
        if (!existingUser) {
            throw new UserNotFoundInDatabaseException();
        }

        await this.supabase.auth.admin.deleteUser(existingUser.supabaseUserId ?? '');

        const user = await this.userRepository.delete(id);

        return new UserDto({ ...user });
    }
}
