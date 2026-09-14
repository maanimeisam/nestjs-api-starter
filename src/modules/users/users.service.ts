import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/authenticated-user.js';
import { Paginated, paginationMeta } from '../../common/pagination.js';
import { Role, User } from './user.entity.js';
import { UserResponseDto, userResponse } from './users.dto.js';

interface CreateUserInput {
  email: string;
  username: string;
  passwordHash: string;
}

interface DatabaseError extends Error {
  code?: unknown;
  constraint?: unknown;
}

function isUniqueViolation(
  error: unknown,
): error is QueryFailedError<DatabaseError> {
  return (
    error instanceof QueryFailedError && error.driverError.code === '23505'
  );
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    try {
      return await this.users.save(
        this.users.create({
          ...input,
          email: input.email.trim().toLowerCase(),
          username: input.username.trim().toLowerCase(),
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const field =
        error.driverError.constraint === 'uq_users_email'
          ? 'email'
          : 'username';
      throw new ConflictException(`A user with this ${field} already exists`);
    }
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<User> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findVisibleById(
    requester: AuthenticatedUser,
    id: string,
  ): Promise<UserResponseDto> {
    if (requester.role !== Role.ADMIN && requester.id !== id) {
      throw new ForbiddenException();
    }
    return userResponse(await this.findById(id));
  }

  async list(page: number, limit: number): Promise<Paginated<UserResponseDto>> {
    const [users, totalItems] = await this.users.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: users.map(userResponse),
      meta: paginationMeta(page, limit, totalItems),
    };
  }
}
