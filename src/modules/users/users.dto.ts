import { Role, User } from './user.entity.js';
import { PaginationMeta } from '../../common/pagination.js';

export class UserResponseDto {
  id!: string;
  email!: string;
  username!: string;
  role!: Role;
  createdAt!: Date;
  updatedAt!: Date;
}

export class UsersPageDto {
  items!: UserResponseDto[];
  meta!: PaginationMeta;
}

export function userResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
