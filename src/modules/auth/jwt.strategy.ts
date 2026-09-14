import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../common/authenticated-user.js';
import authConfig from '../../config/auth.config.js';
import { Role } from '../users/user.entity.js';

interface AccessTokenPayload {
  sub: string;
  role: Role;
  type: 'access';
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'string' &&
    (payload.role === Role.USER || payload.role === Role.ADMIN) &&
    payload.type === 'access'
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(authConfig.KEY) config: ConfigType<typeof authConfig>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.accessSecret,
    });
  }

  validate(payload: unknown): AuthenticatedUser {
    if (!isAccessTokenPayload(payload)) throw new UnauthorizedException();
    return { id: payload.sub, role: payload.role };
  }
}
