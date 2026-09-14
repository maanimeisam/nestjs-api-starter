import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

const RateLimitMetadata = Reflector.createDecorator<RateLimitPolicy>();
const RATE_LIMIT_KEY = RateLimitMetadata.KEY;
const DEFAULT_POLICY: RateLimitPolicy = { limit: 120, windowMs: 60_000 };
const MAX_ENTRIES = 10_000;

export const RateLimit = (
  limit: number,
  windowMs: number,
): MethodDecorator & ClassDecorator => RateLimitMetadata({ limit, windowMs });

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  // ponytail: per-process storage; use a shared limiter when scaling horizontally.
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy =
      this.reflector.getAllAndOverride<RateLimitPolicy>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_POLICY;
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    const key = `${request.ip}:${context.getClass().name}:${context.getHandler().name}`;
    let entry = this.entries.get(key);

    if (!entry || entry.resetAt <= now) {
      this.makeRoom(now);
      entry = { count: 0, resetAt: now + policy.windowMs };
      this.entries.set(key, entry);
    }

    const remaining = Math.max(0, policy.limit - entry.count - 1);
    response.setHeader('RateLimit-Limit', policy.limit);
    response.setHeader('RateLimit-Remaining', remaining);
    response.setHeader('RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count >= policy.limit) {
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
    return true;
  }

  private makeRoom(now: number): void {
    if (this.entries.size < MAX_ENTRIES) return;

    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }

    if (this.entries.size >= MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey === 'string') this.entries.delete(oldestKey);
    }
  }
}
