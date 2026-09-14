import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user.js';
import type { Role } from '../modules/users/user.entity.js';

const PublicMetadata = Reflector.createDecorator<boolean>();
const RolesMetadata = Reflector.createDecorator<readonly Role[]>();

export const PUBLIC_KEY = PublicMetadata.KEY;
export const ROLES_KEY = RolesMetadata.KEY;

export const Public = (): MethodDecorator & ClassDecorator =>
  PublicMetadata(true);

export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  RolesMetadata(roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>()
      .user,
);
