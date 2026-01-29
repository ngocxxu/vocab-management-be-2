import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IResponse } from '../../common';
import { PrismaErrorHandler } from '../../common/handler/error.handler';
import { UserDto, UserInput } from '../model';
import { UserRepository } from '../repository';

@Injectable()
export class UserService {
    private readonly supabase: SupabaseClient;

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

    public constructor(private readonly userRepository: UserRepository) {
        this.supabase = createClient(
            process.env.SUPABASE_URL ?? '',
            process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            },
        );
    }

    /**
     * Find all users in the database
     */
    public async find(): Promise<IResponse<UserDto[]>> {
        try {
            const users = await this.userRepository.findAll();

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
            const user = await this.userRepository.findBySupabaseUserId(supabaseUserId);

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
                throw new Error(`Supabase create error: ${error.message}`);
            }
            if (!data.user) {
                throw new Error('User data is missing from Supabase response');
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
        } catch (error) {
            PrismaErrorHandler.handle(error, 'create', this.userErrorMapping);
        }
    }

    /**
     * Update a user record
     */
    public async update(updateUserData: UserInput): Promise<UserDto> {
        try {
            const { id, email, firstName, lastName, phone, avatar, role, isActive, password } =
                updateUserData;

            if (!id) {
                throw new Error('Supabase user ID is required for update');
            }

            const existingUser = await this.userRepository.findById(id);

            if (!existingUser) {
                throw new Error('User not found');
            }

            if (password) {
                const { error } = await this.supabase.auth.admin.updateUserById(
                    existingUser.supabaseUserId ?? '',
                    {
                        password,
                    },
                );
                if (error) {
                    throw new Error(`Supabase update password error: ${error.message}`);
                }
            }

            // 2. Update user in Supabase if email is being changed
            if (email && email !== existingUser.email) {
                const { error } = await this.supabase.auth.admin.updateUserById(
                    existingUser.supabaseUserId ?? '',
                    {
                        email,
                    },
                );

                if (error) {
                    throw new Error(`Supabase update email error: ${error.message}`);
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

            const user = await this.userRepository.update(id, updateData);

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
            const existingUser = await this.userRepository.findById(id);
            if (!existingUser) {
                throw new NotFoundException('User not found in local database');
            }

            await this.supabase.auth.admin.deleteUser(
                existingUser.supabaseUserId ?? '',
            );

            const user = await this.userRepository.delete(id);

            return new UserDto({ ...user });
        } catch (error) {
            if (error instanceof HttpException && error.getStatus()) {
                throw error;
            }
            PrismaErrorHandler.handle(error, 'delete', this.userErrorMapping);
        }
    }
}
