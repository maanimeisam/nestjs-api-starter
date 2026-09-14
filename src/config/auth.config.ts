import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  accessExpiresIn: Number(process.env.JWT_ACCESS_EXPIRES_IN ?? 900),
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  refreshExpiresIn: Number(process.env.JWT_REFRESH_EXPIRES_IN ?? 2_592_000),
}));
