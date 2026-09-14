import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RateLimit, RateLimitGuard } from './rate-limit.guard.js';

class TestController {
  normal(): void {}
  limited(): void {}
}

const descriptor = Object.getOwnPropertyDescriptor(
  TestController.prototype,
  'limited',
);
if (!descriptor) throw new Error('Missing method descriptor');
RateLimit(10, 60_000)(TestController.prototype, 'limited', descriptor);

function contextFor(
  handler: () => void,
  ip: string,
  headers: Map<string, number>,
): ExecutionContext {
  const request = { ip } as Request;
  const response = {
    setHeader(name: string, value: number) {
      headers.set(name, value);
    },
  } as unknown as Response;
  return {
    getClass: () => TestController,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  it('replaces the global policy with route metadata instead of stacking', () => {
    const guard = new RateLimitGuard(new Reflector());
    const headers = new Map<string, number>();
    const context = contextFor(
      TestController.prototype.limited,
      '127.0.0.1',
      headers,
    );

    for (let request = 0; request < 10; request += 1) {
      expect(guard.canActivate(context)).toBe(true);
    }
    expect(headers.get('RateLimit-Limit')).toBe(10);
    expect(() => guard.canActivate(context)).toThrow(HttpException);

    const globalHeaders = new Map<string, number>();
    expect(
      guard.canActivate(
        contextFor(TestController.prototype.normal, '127.0.0.1', globalHeaders),
      ),
    ).toBe(true);
    expect(globalHeaders.get('RateLimit-Limit')).toBe(120);
    expect(globalHeaders.get('RateLimit-Remaining')).toBe(119);
  });

  it('bounds its in-memory storage', () => {
    const guard = new RateLimitGuard(new Reflector());
    for (let index = 0; index <= 10_000; index += 1) {
      guard.canActivate(
        contextFor(
          TestController.prototype.normal,
          `192.0.2.${index}`,
          new Map(),
        ),
      );
    }

    const entries = (guard as unknown as { entries: Map<string, unknown> })
      .entries;
    expect(entries.size).toBeLessThanOrEqual(10_000);
  });
});
