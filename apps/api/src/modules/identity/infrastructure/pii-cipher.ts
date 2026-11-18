import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const VERSION = 'v1';

function parseKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('PII key must be 32 bytes encoded as base64.');
  return key;
}

/** AES-256-GCM column encryption. Output: `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function encryptPii(plaintext: string, keyBase64: string): string {
  const key = parseKey(keyBase64);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function decryptPii(payload: string, keyBase64: string): string {
  const key = parseKey(keyBase64);
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Unsupported PII payload.');
  const [, ivText, tagText, dataText] = parts as [string, string, string, string];
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Deterministic keyed hash used to look up an account by email without storing it in clear. */
export function blindIndex(value: string, keyBase64: string): string {
  return createHmac('sha256', parseKey(keyBase64))
    .update(value.trim().toLowerCase(), 'utf8')
    .digest('hex');
}
