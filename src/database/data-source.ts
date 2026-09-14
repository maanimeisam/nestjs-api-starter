import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { validateEnvironment } from '../config/environment.js';
import { createDatabaseOptions } from './database.options.js';

if (existsSync('.env')) process.loadEnvFile('.env');

if (!process.env.DATABASE_URL && process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const environment = validateEnvironment(process.env);

export default new DataSource(
  createDatabaseOptions(environment.DATABASE_URL, environment.DATABASE_SSL),
);
