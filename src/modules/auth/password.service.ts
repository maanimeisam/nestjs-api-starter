import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const VERSION = 1;
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

interface ScryptParameters {
  cost: number;
  blockSize: number;
  parallelization: number;
  keyLength: number;
  maxMemory: number;
  salt: Buffer;
  digest: Buffer;
}

function derive(
  password: string,
  salt: Buffer,
  parameters: Omit<ScryptParameters, 'salt' | 'digest'>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      parameters.keyLength,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem: parameters.maxMemory,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

function parseInteger(part: string, key: string): number {
  const [name, rawValue, extra] = part.split('=');
  const value = Number(rawValue);
  if (name !== key || extra !== undefined || !Number.isSafeInteger(value)) {
    throw new Error(`Invalid ${key}`);
  }
  return value;
}

function parseHash(storedHash: string): ScryptParameters {
  const [
    algorithm,
    versionPart,
    costPart,
    blockSizePart,
    parallelPart,
    keyPart,
    memoryPart,
    saltPart,
    digestPart,
    extra,
  ] = storedHash.split('$');
  if (
    algorithm !== 'scrypt' ||
    extra !== undefined ||
    !saltPart ||
    !digestPart
  ) {
    throw new Error('Invalid password hash');
  }

  const version = parseInteger(versionPart, 'v');
  const cost = parseInteger(costPart, 'N');
  const blockSize = parseInteger(blockSizePart, 'r');
  const parallelization = parseInteger(parallelPart, 'p');
  const keyLength = parseInteger(keyPart, 'keylen');
  const maxMemory = parseInteger(memoryPart, 'maxmem');
  const requiredMemory = 128 * cost * blockSize;

  if (
    version !== VERSION ||
    cost < 16_384 ||
    cost > 262_144 ||
    (cost & (cost - 1)) !== 0 ||
    blockSize < 1 ||
    blockSize > 16 ||
    parallelization < 1 ||
    parallelization > 4 ||
    keyLength < 32 ||
    keyLength > 128 ||
    maxMemory < requiredMemory + 1024 ||
    maxMemory > 512 * 1024 * 1024
  ) {
    throw new Error('Unsupported password hash parameters');
  }

  const salt = Buffer.from(saltPart, 'base64url');
  const digest = Buffer.from(digestPart, 'base64url');
  if (salt.length < 16 || digest.length !== keyLength) {
    throw new Error('Invalid password hash data');
  }

  return {
    cost,
    blockSize,
    parallelization,
    keyLength,
    maxMemory,
    salt,
    digest,
  };
}

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const parameters = {
      cost: COST,
      blockSize: BLOCK_SIZE,
      parallelization: PARALLELIZATION,
      keyLength: KEY_LENGTH,
      maxMemory: MAX_MEMORY,
    };
    const digest = await derive(password, salt, parameters);

    return [
      'scrypt',
      `v=${VERSION}`,
      `N=${parameters.cost}`,
      `r=${parameters.blockSize}`,
      `p=${parameters.parallelization}`,
      `keylen=${parameters.keyLength}`,
      `maxmem=${parameters.maxMemory}`,
      salt.toString('base64url'),
      digest.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    try {
      const parameters = parseHash(storedHash);
      const actual = await derive(password, parameters.salt, parameters);
      return (
        actual.length === parameters.digest.length &&
        timingSafeEqual(actual, parameters.digest)
      );
    } catch {
      return false;
    }
  }
}
