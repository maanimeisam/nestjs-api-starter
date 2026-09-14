import { scrypt, timingSafeEqual } from 'node:crypto';
import { PasswordService } from './password.service.js';

vi.mock('node:crypto', async (importOriginal) => {
  const crypto = await importOriginal<typeof import('node:crypto')>();
  return {
    ...crypto,
    scrypt: vi.fn(crypto.scrypt),
    timingSafeEqual: vi.fn(crypto.timingSafeEqual),
  };
});

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
  });
}

describe('PasswordService', () => {
  const service = new PasswordService();

  it('creates and verifies a versioned asynchronous scrypt hash', async () => {
    vi.mocked(scrypt).mockClear();
    const hashPromise = service.hash('correct horse battery staple');
    expect(hashPromise).toBeInstanceOf(Promise);
    const hash = await hashPromise;

    expect(hash).toMatch(
      /^scrypt\$v=1\$N=32768\$r=8\$p=1\$keylen=64\$maxmem=67108864\$/,
    );
    const options = (vi.mocked(scrypt).mock.calls[0] as unknown[])[3];
    expect(options).toMatchObject({
      N: 32_768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    await expect(
      service.verify('correct horse battery staple', hash),
    ).resolves.toBe(true);
    await expect(service.verify('wrong password', hash)).resolves.toBe(false);
  });

  it('uses valid parameters stored with the hash', async () => {
    const salt = Buffer.alloc(16, 7);
    const digest = await derive('stored parameters', salt);
    const stored = [
      'scrypt',
      'v=1',
      'N=16384',
      'r=8',
      'p=1',
      'keylen=64',
      'maxmem=67108864',
      salt.toString('base64url'),
      digest.toString('base64url'),
    ].join('$');

    await expect(service.verify('stored parameters', stored)).resolves.toBe(
      true,
    );
  });

  it.each([
    '',
    'not-scrypt',
    'scrypt$v=2$N=32768$r=8$p=1$keylen=64$maxmem=67108864$salt$digest',
    'scrypt$v=1$N=32768$r=8$p=1$keylen=64$maxmem=33554432$salt$digest',
    'scrypt$v=1$N=nope$r=8$p=1$keylen=64$maxmem=67108864$salt$digest',
  ])('rejects malformed or unsupported hash %j', async (stored) => {
    await expect(service.verify('password', stored)).resolves.toBe(false);
  });

  it('uses a timing-safe comparison for equal-length derived keys', async () => {
    const hash = await service.hash('timing-safe password');
    vi.mocked(timingSafeEqual).mockClear();

    await expect(service.verify('timing-safe password', hash)).resolves.toBe(
      true,
    );
    expect(timingSafeEqual).toHaveBeenCalledOnce();
    const [actual, expected] = vi.mocked(timingSafeEqual).mock.calls[0];
    expect(actual.byteLength).toBe(expected.byteLength);
  });
});
