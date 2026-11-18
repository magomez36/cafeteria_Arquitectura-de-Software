import * as nodeCrypto from 'node:crypto';
import { randomBytes, timingSafeEqual } from 'node:crypto';

interface Argon2Params {
  message: Buffer;
  nonce: Buffer;
  parallelism: number;
  tagLength: number;
  memory: number;
  passes: number;
}

type Argon2Fn = (
  algorithm: 'argon2id',
  params: Argon2Params,
  callback: (error: Error | null, derivedKey: Buffer) => void,
) => void;

// @types/node 22 does not declare crypto.argon2 (available at runtime since Node 24.7).
const argon2 = (nodeCrypto as unknown as { argon2?: Argon2Fn }).argon2;

const MEMORY_KIB = 19456;
const PASSES = 2;
const PARALLELISM = 1;
const TAG_LENGTH = 32;
const SALT_LENGTH = 16;

function derive(
  password: string,
  salt: Buffer,
  memory: number,
  passes: number,
  parallelism: number,
): Promise<Buffer> {
  if (!argon2) return Promise.reject(new Error('crypto.argon2 requires Node.js 24.7 or later.'));
  const fn = argon2;
  return new Promise((resolve, reject) => {
    fn(
      'argon2id',
      {
        message: Buffer.from(password, 'utf8'),
        nonce: salt,
        parallelism,
        tagLength: TAG_LENGTH,
        memory,
        passes,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** Hashes a password as `argon2id$m$t$p$salt$hash` (base64url salt and hash). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, MEMORY_KIB, PASSES, PARALLELISM);
  return [
    'argon2id',
    MEMORY_KIB,
    PASSES,
    PARALLELISM,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'argon2id') return false;
  const [, m, t, p, saltText, hashText] = parts as [string, string, string, string, string, string];
  const memory = Number(m);
  const passes = Number(t);
  const parallelism = Number(p);
  if (![memory, passes, parallelism].every((n) => Number.isInteger(n) && n > 0)) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const actual = await derive(
    password,
    Buffer.from(saltText, 'base64url'),
    memory,
    passes,
    parallelism,
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
