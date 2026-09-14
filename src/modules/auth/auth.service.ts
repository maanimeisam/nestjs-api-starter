import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/authenticated-user.js';
import authConfig from '../../config/auth.config.js';
import { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { userResponse } from '../users/users.dto.js';
import {
  AuthResponseDto,
  LoginDto,
  RegisterDto,
  TokenPairDto,
} from './auth.dto.js';
import { PasswordService } from './password.service.js';
import { RefreshSession } from './refresh-session.entity.js';

interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}

function isRefreshTokenPayload(value: unknown): value is RefreshTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.sid === 'string' &&
    payload.type === 'refresh'
  );
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function equalTokenHashes(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    @InjectRepository(RefreshSession)
    private readonly sessions: Repository<RefreshSession>,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async register(input: RegisterDto): Promise<AuthResponseDto> {
    const passwordHash = await this.passwordService.hash(input.password);
    const user = await this.usersService.create({
      email: input.email,
      username: input.username,
      passwordHash,
    });
    return {
      user: userResponse(user),
      tokens: await this.createTokenPair(user, this.sessions),
    };
  }

  async login(input: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(input.email);
    if (
      !user ||
      !(await this.passwordService.verify(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return {
      user: userResponse(user),
      tokens: await this.createTokenPair(user, this.sessions),
    };
  }

  async refresh(refreshToken: string): Promise<TokenPairDto> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const suppliedHash = tokenHash(refreshToken);

    return this.dataSource.transaction(async (manager) => {
      const session = await manager
        .getRepository(RefreshSession)
        .createQueryBuilder('session')
        .addSelect('session.tokenHash')
        .where('session.id = :id', { id: payload.sid })
        .setLock('pessimistic_write')
        .getOne();
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now() ||
        !equalTokenHashes(session.tokenHash, suppliedHash)
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await manager
        .getRepository(User)
        .findOneBy({ id: payload.sub });
      if (!user) throw new UnauthorizedException('Invalid refresh token');

      session.revokedAt = new Date();
      await manager.getRepository(RefreshSession).save(session);
      return this.createTokenPair(user, manager.getRepository(RefreshSession));
    });
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch {
      return;
    }

    const suppliedHash = tokenHash(refreshToken);
    const session = await this.sessions
      .createQueryBuilder('session')
      .addSelect('session.tokenHash')
      .where('session.id = :id', { id: payload.sid })
      .andWhere('session.userId = :userId', { userId: payload.sub })
      .andWhere('session.revokedAt IS NULL')
      .getOne();
    if (session && equalTokenHashes(session.tokenHash, suppliedHash)) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
    }
  }

  async me(user: AuthenticatedUser) {
    return userResponse(await this.usersService.findById(user.id));
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<
        Record<string, unknown>
      >(token, { secret: this.config.refreshSecret });
      if (!isRefreshTokenPayload(payload)) throw new Error('Invalid payload');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async createTokenPair(
    user: Pick<User, 'id' | 'role'>,
    sessions: Repository<RefreshSession>,
  ): Promise<TokenPairDto> {
    const sessionId = randomUUID();
    const accessPayload = {
      sub: user.id,
      role: user.role,
      type: 'access' as const,
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      sid: sessionId,
      type: 'refresh',
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.accessSecret,
        expiresIn: this.config.accessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.config.refreshSecret,
        expiresIn: this.config.refreshExpiresIn,
      }),
    ]);

    await sessions.save(
      sessions.create({
        id: sessionId,
        userId: user.id,
        tokenHash: tokenHash(refreshToken),
        expiresAt: new Date(Date.now() + this.config.refreshExpiresIn * 1000),
        revokedAt: null,
      }),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.accessExpiresIn,
    };
  }
}
