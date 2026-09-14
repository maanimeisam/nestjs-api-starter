import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnvironment {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TEST = 'test',
}

export enum AppLogLevel {
  FATAL = 'fatal',
  ERROR = 'error',
  WARN = 'warn',
  LOG = 'log',
  DEBUG = 'debug',
  VERBOSE = 'verbose',
}

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
};

export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.DEVELOPMENT;

  @IsString()
  @MinLength(1)
  APP_NAME = 'NestJS API Starter';

  @Matches(/^\d+\.\d+\.\d+$/)
  APP_VERSION = '0.0.1';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT = 3000;

  @Matches(/^[a-z0-9][a-z0-9/-]*$/)
  API_PREFIX = 'api';

  @Matches(/^\d+$/)
  API_VERSION = '1';

  @IsUrl({
    protocols: ['postgres', 'postgresql'],
    require_protocol: true,
    require_tld: false,
  })
  DATABASE_URL!: string;

  @Transform(toBoolean)
  @IsBoolean()
  DATABASE_SSL = false;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_ACCESS_EXPIRES_IN = 900;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(300)
  JWT_REFRESH_EXPIRES_IN = 2_592_000;

  @IsString()
  @MinLength(1)
  CORS_ORIGINS = 'http://localhost:3000';

  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsEnum(AppLogLevel)
  LOG_LEVEL: AppLogLevel = AppLogLevel.LOG;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY_HOPS = 0;
}

export function validateEnvironment(
  values: Record<string, unknown>,
): EnvironmentVariables {
  const environment = plainToInstance(EnvironmentVariables, values, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(environment, {
    skipMissingProperties: false,
    forbidUnknownValues: true,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration: ${errors
        .flatMap((error) => Object.values(error.constraints ?? {}))
        .join('; ')}`,
    );
  }

  if (
    environment.NODE_ENV === NodeEnvironment.PRODUCTION &&
    (environment.JWT_ACCESS_SECRET.startsWith('change-me') ||
      environment.JWT_REFRESH_SECRET.startsWith('change-me'))
  ) {
    throw new Error('Production JWT secrets must not use example values');
  }

  if (
    environment.NODE_ENV === NodeEnvironment.PRODUCTION &&
    environment.CORS_ORIGINS.split(',').some((origin) => origin.trim() === '*')
  ) {
    throw new Error('Wildcard CORS origins are not allowed in production');
  }

  for (const origin of environment.CORS_ORIGINS.split(',')) {
    try {
      const url = new URL(origin.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new Error();
    } catch {
      throw new Error(`Invalid CORS origin: ${origin.trim()}`);
    }
  }

  return environment;
}
