import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;
const logger = new Logger('HTTP');

export function requestContext(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.get('x-request-id');
  const requestId =
    incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  const startedAt = performance.now();

  request.headers['x-request-id'] = requestId;
  response.setHeader('X-Request-Id', requestId);
  response.on('finish', () => {
    logger.log('Request handled', {
      requestId,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    });
  });
  next();
}
