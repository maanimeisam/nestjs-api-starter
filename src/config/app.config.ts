import { registerAs } from '@nestjs/config';
import { AppLogLevel, NodeEnvironment } from './environment.js';

function logLevel(value: string | undefined): AppLogLevel {
  switch (value) {
    case AppLogLevel.FATAL:
    case AppLogLevel.ERROR:
    case AppLogLevel.WARN:
    case AppLogLevel.LOG:
    case AppLogLevel.DEBUG:
    case AppLogLevel.VERBOSE:
      return value;
    default:
      return AppLogLevel.LOG;
  }
}

export default registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'NestJS API Starter',
  version: process.env.APP_VERSION ?? '0.0.1',
  nodeEnv: process.env.NODE_ENV ?? NodeEnvironment.DEVELOPMENT,
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  apiVersion: process.env.API_VERSION ?? '1',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  swaggerEnabled:
    (process.env.SWAGGER_ENABLED ?? 'true').toLowerCase() === 'true',
  logLevel: logLevel(process.env.LOG_LEVEL),
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
}));
