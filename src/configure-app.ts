import {
  ConsoleLogger,
  ValidationPipe,
  VersioningType,
  type LogLevel,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import appConfig from './config/app.config.js';
import { AppLogLevel, NodeEnvironment } from './config/environment.js';
import { requestContext } from './common/request-context.middleware.js';

function enabledLogLevels(level: AppLogLevel): LogLevel[] {
  const levels: LogLevel[] = [
    'fatal',
    'error',
    'warn',
    'log',
    'debug',
    'verbose',
  ];
  return levels.slice(0, levels.indexOf(level) + 1);
}

export function configureApplication(app: NestExpressApplication): void {
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  const production = config.nodeEnv === NodeEnvironment.PRODUCTION;

  app.useLogger(
    new ConsoleLogger({
      json: production,
      colors: !production,
      timestamp: !production,
      logLevels: enabledLogLevels(config.logLevel),
      flattenParams: production,
    }),
  );
  app.set('trust proxy', config.trustProxyHops);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
  app.use(compression());
  app.use(requestContext);
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
  });
  app.setGlobalPrefix(config.apiPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: config.apiVersion,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle(config.name)
        .setDescription('Production REST API starter')
        .setVersion(config.version)
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });
  }
}
