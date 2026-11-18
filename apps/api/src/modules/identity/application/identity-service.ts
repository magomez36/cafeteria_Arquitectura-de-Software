import { createHash } from 'node:crypto';
import {
  EmailNotConfirmedError,
  InvalidCredentialsError,
  InvalidTokenError,
  TooManyAttemptsError,
  ValidationError,
} from '../domain/errors';
import { hashToken, issueToken, tokenState, type TokenPurpose } from '../domain/one-time-token';
import type {
  Account,
  AccountRepository,
  EmailPort,
  RateLimiter,
  SecurityEventLog,
  SecurityEventType,
  SessionData,
  SessionStore,
  TokenRepository,
} from '../domain/ports';
import {
  normalizeEmail,
  validateEmail,
  validateNewPassword,
  validateRegistration,
} from '../domain/validation';
import { hashPassword, verifyPassword } from '../infrastructure/password-hasher';
import { blindIndex, decryptPii, encryptPii } from '../infrastructure/pii-cipher';

export interface IdentityConfig {
  readonly piiKey: string;
  readonly webBaseUrl: string;
  readonly sessionTtlSeconds: number;
}

export interface IdentityDeps {
  readonly accounts: AccountRepository;
  readonly tokens: TokenRepository;
  readonly sessions: SessionStore;
  readonly limiter: RateLimiter;
  readonly email: EmailPort;
  readonly events: SecurityEventLog;
  readonly config: IdentityConfig;
  readonly now?: () => Date;
}

export type LoginResult =
  | { readonly status: 'authenticated'; readonly sessionId: string; readonly session: SessionData }
  | { readonly status: 'mfa_required'; readonly challengeId: string }
  | {
      readonly status: 'mfa_enrollment_required';
      readonly sessionId: string;
      readonly session: SessionData;
    };

const LOGIN_LIMIT_PER_ACCOUNT = 5;
const LOGIN_LIMIT_PER_IP = 30;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const REGISTER_LIMIT_PER_IP = 10;
const REGISTER_WINDOW_SECONDS = 60 * 60;
const FORGOT_LIMIT = 5;
const FORGOT_WINDOW_SECONDS = 60 * 60;
const CHALLENGE_TTL_SECONDS = 5 * 60;

let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('timing-equalizer-not-a-real-password');
  return dummyHash;
}

export class IdentityService {
  constructor(private readonly deps: IdentityDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  hashIp(ip: string): string {
    return createHash('sha256')
      .update(`${ip}|${this.deps.config.piiKey}`)
      .digest('hex')
      .slice(0, 32);
  }

  private async event(
    type: SecurityEventType,
    accountId: string | null,
    ip: string,
  ): Promise<void> {
    await this.deps.events.record(type, accountId, this.hashIp(ip));
  }

  private async sendSafely(
    account: Account | null,
    to: string,
    subject: string,
    text: string,
    ip: string,
  ): Promise<void> {
    try {
      await this.deps.email.send({ to, subject, text });
    } catch {
      await this.event('email_delivery_failed', account?.id ?? null, ip);
    }
  }

  private link(path: string, token: string): string {
    return `${this.deps.config.webBaseUrl}${path}?token=${encodeURIComponent(token)}`;
  }

  private async issueAndStore(accountId: string, purpose: TokenPurpose): Promise<string> {
    const issued = issueToken(purpose, this.now());
    await this.deps.tokens.save({
      tokenHash: issued.tokenHash,
      accountId,
      purpose,
      expiresAt: issued.expiresAt,
    });
    return issued.token;
  }

  displayName(account: Account): string {
    return account.displayNameEnc
      ? decryptPii(account.displayNameEnc, this.deps.config.piiKey)
      : '';
  }

  private accountEmail(account: Account): string {
    return decryptPii(account.emailEnc, this.deps.config.piiKey);
  }

  /** FR-001, FR-006: always answers the same way, whether or not the email exists. */
  async register(input: {
    fullName: string;
    email: string;
    password: string;
    acceptedPolicy: boolean;
    ip: string;
  }): Promise<void> {
    const limit = await this.deps.limiter.hit(
      `register:ip:${this.hashIp(input.ip)}`,
      REGISTER_LIMIT_PER_IP,
      REGISTER_WINDOW_SECONDS,
    );
    if (!limit.allowed) throw new TooManyAttemptsError(limit.retryAfterSeconds);

    const errors = validateRegistration(input);
    if (errors.length > 0) throw new ValidationError(errors);

    const email = normalizeEmail(input.email);
    const { piiKey } = this.deps.config;
    const passwordHash = await hashPassword(input.password);
    const created = await this.deps.accounts.create({
      emailBlind: blindIndex(email, piiKey),
      emailEnc: encryptPii(email, piiKey),
      displayNameEnc: encryptPii(input.fullName.trim(), piiKey),
      passwordHash,
      role: 'customer',
      status: 'pending',
      policyAcceptedAt: this.now(),
    });

    if (!created) {
      const existing = await this.deps.accounts.findByEmailBlind(blindIndex(email, piiKey));
      await this.sendSafely(
        existing,
        email,
        'Intento de registro con tu correo',
        'Alguien intentó crear una cuenta con este correo, pero ya tienes una. ' +
          `Si fuiste tú, inicia sesión o recupera tu contraseña en ${this.deps.config.webBaseUrl}/recuperar. ` +
          'Si no fuiste tú, puedes ignorar este mensaje.',
        input.ip,
      );
      return;
    }

    await this.event('register', created.id, input.ip);
    const token = await this.issueAndStore(created.id, 'verify_email');
    await this.sendSafely(
      created,
      email,
      'Confirma tu correo',
      `Hola ${input.fullName.trim()}, confirma tu correo con este enlace: ${this.link('/verificar-correo', token)}`,
      input.ip,
    );
  }

  private async consumeToken(rawToken: string, purpose: TokenPurpose): Promise<string> {
    const stored = await this.deps.tokens.find(hashToken(rawToken));
    if (!stored || stored.purpose !== purpose) throw new InvalidTokenError('invalid');
    const state = tokenState(stored, this.now());
    if (state !== 'valid') throw new InvalidTokenError(state);
    if (!(await this.deps.tokens.markUsed(hashToken(rawToken), this.now()))) {
      throw new InvalidTokenError('used');
    }
    return stored.accountId;
  }

  /** FR-002 */
  async verifyEmail(rawToken: string, ip: string): Promise<void> {
    const accountId = await this.consumeToken(rawToken, 'verify_email');
    const account = await this.deps.accounts.findById(accountId);
    if (account && account.status === 'pending') {
      await this.deps.accounts.setStatus(account.id, 'active');
      await this.event('email_verified', account.id, ip);
    }
  }

  /** Uniform answer: never reveals whether the email is registered. */
  async resendVerification(rawEmail: string, ip: string): Promise<void> {
    const limit = await this.deps.limiter.hit(
      `resend:ip:${this.hashIp(ip)}`,
      FORGOT_LIMIT,
      FORGOT_WINDOW_SECONDS,
    );
    if (!limit.allowed) throw new TooManyAttemptsError(limit.retryAfterSeconds);
    const email = normalizeEmail(rawEmail);
    if (validateEmail(email).length > 0) return;
    const account = await this.deps.accounts.findByEmailBlind(
      blindIndex(email, this.deps.config.piiKey),
    );
    if (!account || account.status !== 'pending') return;
    const token = await this.issueAndStore(account.id, 'verify_email');
    await this.sendSafely(
      account,
      email,
      'Confirma tu correo',
      `Confirma tu correo con este enlace: ${this.link('/verificar-correo', token)}`,
      ip,
    );
  }

  /** FR-003, FR-005, FR-006 */
  async login(input: { email: string; password: string; ip: string }): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const emailBlind = blindIndex(email, this.deps.config.piiKey);
    const ipLimit = await this.deps.limiter.hit(
      `login:ip:${this.hashIp(input.ip)}`,
      LOGIN_LIMIT_PER_IP,
      LOGIN_WINDOW_SECONDS,
    );
    const accountLimit = await this.deps.limiter.hit(
      `login:acct:${emailBlind}`,
      LOGIN_LIMIT_PER_ACCOUNT,
      LOGIN_WINDOW_SECONDS,
    );
    const account = await this.deps.accounts.findByEmailBlind(emailBlind);

    if (!ipLimit.allowed || !accountLimit.allowed) {
      await this.event('login_rate_limited', account?.id ?? null, input.ip);
      if (account && accountLimit.count === LOGIN_LIMIT_PER_ACCOUNT + 1) {
        await this.sendSafely(
          account,
          this.accountEmail(account),
          'Varios intentos fallidos de inicio de sesión',
          'Detectamos varios intentos de inicio de sesión en tu cuenta y los pausamos unos minutos. ' +
            'Si no fuiste tú, te recomendamos cambiar tu contraseña.',
          input.ip,
        );
      }
      throw new TooManyAttemptsError(
        Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds),
      );
    }

    // Always verify against a hash so the response time does not reveal whether the account exists.
    const passwordOk = await verifyPassword(
      input.password,
      account?.passwordHash ?? (await getDummyHash()),
    );
    if (!account || !passwordOk || account.status === 'disabled') {
      await this.event('login_failed', account?.id ?? null, input.ip);
      throw new InvalidCredentialsError();
    }
    if (account.status === 'pending') throw new EmailNotConfirmedError();

    const needsSecondFactor = account.role !== 'customer' || account.mfaEnabled;
    if (needsSecondFactor && account.mfaEnabled) {
      const challengeId = await this.deps.sessions.createChallenge(
        account.id,
        CHALLENGE_TTL_SECONDS,
      );
      return { status: 'mfa_required', challengeId };
    }

    const session: SessionData = {
      accountId: account.id,
      role: account.role,
      displayName: this.displayName(account),
      mfaVerified: !needsSecondFactor,
    };
    const sessionId = await this.deps.sessions.create(session, this.deps.config.sessionTtlSeconds);
    await this.event('login_success', account.id, input.ip);
    return needsSecondFactor
      ? { status: 'mfa_enrollment_required', sessionId, session }
      : { status: 'authenticated', sessionId, session };
  }

  async logout(sessionId: string | null, ip: string): Promise<void> {
    if (!sessionId) return;
    const session = await this.deps.sessions.get(sessionId);
    await this.deps.sessions.revoke(sessionId);
    if (session) await this.event('logout', session.accountId, ip);
  }

  /** FR-003: uniform answer, one-use token valid for 30 minutes. */
  async forgotPassword(rawEmail: string, ip: string): Promise<void> {
    const limit = await this.deps.limiter.hit(
      `forgot:ip:${this.hashIp(ip)}`,
      FORGOT_LIMIT,
      FORGOT_WINDOW_SECONDS,
    );
    if (!limit.allowed) throw new TooManyAttemptsError(limit.retryAfterSeconds);
    const email = normalizeEmail(rawEmail);
    if (validateEmail(email).length > 0) return;
    const account = await this.deps.accounts.findByEmailBlind(
      blindIndex(email, this.deps.config.piiKey),
    );
    if (!account || account.status === 'disabled') return;
    await this.event('password_reset_requested', account.id, ip);
    const token = await this.issueAndStore(account.id, 'reset_password');
    await this.sendSafely(
      account,
      email,
      'Recupera tu contraseña',
      `Usa este enlace para elegir una nueva contraseña. Caduca en 30 minutos y solo funciona una vez: ${this.link('/restablecer', token)}`,
      ip,
    );
  }

  async resetPassword(rawToken: string, newPassword: string, ip: string): Promise<void> {
    const errors = validateNewPassword(newPassword, 'newPassword');
    if (errors.length > 0) throw new ValidationError(errors);
    const accountId = await this.consumeToken(rawToken, 'reset_password');
    await this.deps.accounts.setPassword(accountId, await hashPassword(newPassword));
    await this.deps.sessions.revokeAllForAccount(accountId);
    await this.event('password_reset_completed', accountId, ip);
  }

  get sessionTtlMs(): number {
    return this.deps.config.sessionTtlSeconds * 1000;
  }

  getSession(sessionId: string | null): Promise<SessionData | null> {
    return sessionId ? this.deps.sessions.get(sessionId) : Promise.resolve(null);
  }
}
