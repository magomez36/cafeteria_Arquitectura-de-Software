import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const DEV_KEY = Buffer.alloc(32, 'customers-dev-only-key').toString('base64');

export function customersKey(): string {
  const key = process.env.CUSTOMERS_PII_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === 'production')
    throw new Error('CUSTOMERS_PII_KEY is required in production.');
  return DEV_KEY;
}

function keyBytes(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('PII key must be 32 bytes encoded as base64.');
  return key;
}

/** AES-256-GCM column encryption owned by the customers module. Format: `v1.<iv>.<tag>.<data>`. */
export function encrypt(plaintext: string, keyBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(keyBase64), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function decrypt(payload: string, keyBase64: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unsupported PII payload.');
  const [, iv, tag, data] = parts as [string, string, string, string];
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyBytes(keyBase64),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
