import {
  ForbiddenError,
  InvalidCredentialsError,
  TooManyAttemptsError,
  UnauthenticatedError,
} from '../domain/errors';
import type { SessionData } from '../domain/ports';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../domain/totp';
import { decryptPii, encryptPii } from '../infrastructure/pii-cipher';
import type { IdentityDeps, LoginResult } from './identity-service';
import { IdentityService } from './identity-service';

const MFA_LIMIT = 5;
const MFA_WINDOW_SECONDS = 15 * 60;

/** Second factor (FR-008): login challenge, enrollment and confirmation. */
export class MfaService {
  constructor(
    private readonly deps: IdentityDeps,
    private readonly identity: IdentityService,
  ) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  async verifyLogin(challengeId: string, code: string, ip: string): Promise<LoginResult> {
    const accountId = await this.deps.sessions.readChallenge(challengeId);
    if (!accountId) throw new InvalidCredentialsError();
    const limit = await this.deps.limiter.hit(
      `mfa:acct:${accountId}`,
      MFA_LIMIT,
      MFA_WINDOW_SECONDS,
    );
    if (!limit.allowed) throw new TooManyAttemptsError(limit.retryAfterSeconds);
    const account = await this.deps.accounts.findById(accountId);
    if (!account || account.status !== 'active' || !account.mfaEnabled || !account.mfaSecretEnc) {
      throw new InvalidCredentialsError();
    }
    const secret = decryptPii(account.mfaSecretEnc, this.deps.config.piiKey);
    if (!verifyTotp(secret, code.trim(), this.now().getTime())) {
      await this.deps.events.record('mfa_failed', account.id, this.identity.hashIp(ip));
      throw new InvalidCredentialsError();
    }
    await this.deps.sessions.deleteChallenge(challengeId);
    const session: SessionData = {
      accountId: account.id,
      role: account.role,
      displayName: this.identity.displayName(account),
      mfaVerified: true,
    };
    const sessionId = await this.deps.sessions.create(session, this.deps.config.sessionTtlSeconds);
    await this.deps.events.record('login_success', account.id, this.identity.hashIp(ip));
    return { status: 'authenticated', sessionId, session };
  }

  async startEnrollment(
    session: SessionData | null,
  ): Promise<{ secret: string; otpauthUri: string }> {
    if (!session) throw new UnauthenticatedError();
    const account = await this.deps.accounts.findById(session.accountId);
    if (!account) throw new UnauthenticatedError();
    if (account.mfaEnabled) throw new ForbiddenError();
    const secret = generateTotpSecret();
    await this.deps.accounts.setMfa(account.id, encryptPii(secret, this.deps.config.piiKey), false);
    const label = decryptPii(account.emailEnc, this.deps.config.piiKey);
    return { secret, otpauthUri: otpauthUri(secret, label) };
  }

  /** Confirms the first code, enables MFA and swaps the session for a fully verified one. */
  async confirmEnrollment(
    sessionId: string,
    session: SessionData | null,
    code: string,
    ip: string,
  ): Promise<{ sessionId: string; session: SessionData }> {
    if (!session) throw new UnauthenticatedError();
    const account = await this.deps.accounts.findById(session.accountId);
    if (!account?.mfaSecretEnc || account.mfaEnabled) throw new ForbiddenError();
    const limit = await this.deps.limiter.hit(
      `mfa:acct:${account.id}`,
      MFA_LIMIT,
      MFA_WINDOW_SECONDS,
    );
    if (!limit.allowed) throw new TooManyAttemptsError(limit.retryAfterSeconds);
    const secret = decryptPii(account.mfaSecretEnc, this.deps.config.piiKey);
    if (!verifyTotp(secret, code.trim(), this.now().getTime())) {
      await this.deps.events.record('mfa_failed', account.id, this.identity.hashIp(ip));
      throw new InvalidCredentialsError();
    }
    await this.deps.accounts.setMfa(account.id, account.mfaSecretEnc, true);
    await this.deps.sessions.revoke(sessionId);
    const upgraded: SessionData = { ...session, mfaVerified: true };
    const newId = await this.deps.sessions.create(upgraded, this.deps.config.sessionTtlSeconds);
    await this.deps.events.record('mfa_enrolled', account.id, this.identity.hashIp(ip));
    return { sessionId: newId, session: upgraded };
  }
}
