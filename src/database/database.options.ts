import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';

export function createDatabaseOptions(
  url: string,
  ssl: boolean,
  loadFiles = true,
): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    ssl: ssl ? { rejectUnauthorized: true } : false,
    entities: loadFiles
      ? [join(import.meta.dirname, '../modules/**/*.entity.{js,ts}')]
      : [],
    migrations: loadFiles
      ? [join(import.meta.dirname, 'migrations/*.{js,ts}')]
      : [],
    installExtensions: false,
    migrationsRun: false,
    synchronize: false,
  };
}
