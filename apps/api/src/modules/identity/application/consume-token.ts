import { InvalidTokenError } from '../domain/errors';
import { hashToken, tokenState, type TokenPurpose } from '../domain/one-time-token';
import type { TokenRepository } from '../domain/ports';

/** Validates and atomically consumes a one-use token; returns the owning account id. */
export async function consumeOneTimeToken(
  tokens: TokenRepository,
  rawToken: string,
  purpose: TokenPurpose,
  now: Date,
): Promise<string> {
  const hash = hashToken(rawToken);
  const stored = await tokens.find(hash);
  if (!stored || stored.purpose !== purpose) throw new InvalidTokenError('invalid');
  const state = tokenState(stored, now);
  if (state !== 'valid') throw new InvalidTokenError(state);
  if (!(await tokens.markUsed(hash, now))) throw new InvalidTokenError('used');
  return stored.accountId;
}
