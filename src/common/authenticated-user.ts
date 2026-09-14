import type { Role } from '../modules/users/user.entity.js';

export interface AuthenticatedUser {
  id: string;
  role: Role;
}
