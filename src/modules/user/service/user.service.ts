import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IResponse, PrismaService } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { UserDto, UserInput } from '../model';

@Injectable()
export class UserService {
    private readonly supabase: SupabaseClient;

    // Custom error mapping cho User
    private readonly userErrorMapping = {
        P2002: 'User name already exists',
        P2025: {
            update: 'User not found',
            delete: 'User not found',
            findOne: 'User not found',
            create: 'One or more products not found',
            find: 'User not found',
        },
    };

    public constructor(private readonly prismaService: PrismaService) {
        this.supabase = createClient(
            process.env.SUPABASE_URL ?? '',
            process.env.SUPABASE_KEY ?? '',
        );
    }

    /**
     * Find all users in the database
     */
    public async find(): Promise<IResponse<UserDto[]>> {
        try {
            const users = await this.prismaService.user.findMany(
            );

            return {
                items: users.map((user) => new UserDto({ ...user })),
                statusCode: HttpStatus.OK,
            };
        } catch (error) {
            PrismaErrorHandler.handle(error, 'find', this.userErrorMapping);
        }
    }

    /**
     * Find a single user by ID
     */
    public async findOne(supabaseUserId: string): Promise<UserDto> {
        try {
            const user = await this.prismaService.user.findUnique({
                where: { supabaseUserId },
            });

            if (!user) {
                throw new NotFoundException(`User with ID ${supabaseUserId} not found`);
            }

            return new UserDto({ ...user });
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'findOne', this.userErrorMapping);
        }
    }

    /**
     * Create a new user record
     */
    public async create(createUserData: UserInput): Promise<UserDto> {
        try {
            const { email, firstName, lastName, phone, avatar, role, password } = createUserData;

            // 1. Create user in Supabase
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password,
            });

            if (error) {
                throw new Error(`Supabase create error: ${error.code}`);
            }
            if (!data.user) {
                throw new Error('User data is missing from Supabase response');
            }

            // 2. Create user in local DB
            const supabaseUser = data.user;
            const user = await this.prismaService.user.create({
                data: {
                    email: email ?? supabaseUser.email,
                    supabaseUserId: supabaseUser.id,
                    firstName,
                    lastName,
                    phone: phone ?? supabaseUser.phone,
                    avatar,
                    role: role ?? UserRole.STAFF, // Use enum value
                    isActive: true,
                },
            });

            return new UserDto({
                ...user,
            });
        } catch (error) {
            PrismaErrorHandler.handle(error, 'create', this.userErrorMapping);
        }
    }

    /**
     * Update a user record
     */
    public async update(updateUserData: UserInput): Promise<UserDto> {
        try {
            const {
                id,
                email,
                firstName,
                lastName,
                phone,
                avatar,
                role,
                isActive,
                password,
            } = updateUserData;

            if (!id) {
                throw new Error('Supabase user ID is required for update');
            }

            // 1. Get current user data
            const existingUser = await this.prismaService.user.findUnique({
                where: { id },
            });

            if (!existingUser) {
                throw new Error('User not found');
            }

            if (password) {
                const { error } = await this.supabase.auth.admin.updateUserById(existingUser.supabaseUserId ?? '', {
                    password,
                });
                if (error) {
                    throw new Error(`Supabase update error: ${error.code}`);
                }
            }

            // 2. Update user in Supabase if email is being changed
            if (email && email !== existingUser.email) {
                const { error } = await this.supabase.auth.admin.updateUserById(existingUser.supabaseUserId ?? '', {
                    email,
                });

                if (error) {
                    throw new Error(`Supabase update error: ${error.code}`);
                }
            }

            // 3. Prepare update data
            const updateData = {
                ...(email !== undefined && { email }),
                ...(firstName !== undefined && { firstName }),
                ...(lastName !== undefined && { lastName }),
                ...(phone !== undefined && { phone }),
                ...(avatar !== undefined && { avatar }),
                ...(role !== undefined && { role }),
                ...(isActive !== undefined && { isActive }),
            };

            // 4. Update user in local DB
            const user = await this.prismaService.user.update({
                where: { id },
                data: updateData,
            });

            return new UserDto({
                ...user,
            });
        } catch (error) {
            PrismaErrorHandler.handle(error, 'update', this.userErrorMapping);
        }
    }

    /**
     * Delete a user from the database
     */
    public async delete(id: string): Promise<UserDto> {
        try {
            const existingUser = await this.prismaService.user.findUnique({
                where: { id },
            });
            if (!existingUser) {
                throw new Error('User not found');
            }
            const { error } = await this.supabase.auth.admin.deleteUser(existingUser.supabaseUserId ?? '');

            if (error) {
                throw new Error(`Supabase delete error: ${error.code}`);
            }

            const user = await this.prismaService.user.delete({
                where: { id },
            });

            return new UserDto({ ...user });
        } catch (error) {
            PrismaErrorHandler.handle(error, 'delete', this.userErrorMapping);
        }
    }
}
