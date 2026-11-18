import { InvalidCredentialsError, TooManyAttemptsError, ValidationError } from '../domain/errors';
import { issueToken } from '../domain/one-time-token';
import type { SessionData } from '../domain/ports';
import { normalizeEmail, validateEmail, validateNewPassword } from '../domain/validation';
import { hashPassword, verifyPassword } from '../infrastructure/password-hasher';
import { blindIndex, decryptPii, encryptPii } from '../infrastructure/pii-cipher';
import { consumeOneTimeToken } from './consume-token';
import type { IdentityDeps } from './identity-service';
import { IdentityService } from './identity-service';

const SENSITIVE_LIMIT = 5;
const SENSITIVE_WINDOW_SECONDS = 15 * 60;
const REAUTH_TTL_SECONDS = 5 * 60;

export interface AccountInfo {
  readonly displayName: string;
  readonly email: string;
  readonly role: string;
  readonly mfaVerified: boolean;
}

/** Sensitive account operations (FR-010) and erasure of identity data (FR-015). */
export class AccountService {
  constructor(
    private readonly deps: IdentityDeps,
    private readonly identity: IdentityService,
  ) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private async confirmPassword(session: SessionData, password: string): Promise<void> {
    const limit = await this.deps.limiter.hit(
      `sensitive:${session.accountId}`,
      SENSITIVE_LIMIT,
      SENSITIVE_WINDOW_SECONDS,
    );
    if (!limit.allowed) throw new TooManyAttemptsError(limit.retryAfterSeconds);
    const account = await this.deps.accounts.findById(session.accountId);
    if (
      !account ||
      account.status !== 'active' ||
      !(await verifyPassword(password, account.passwordHash))
    ) {
      throw new InvalidCredentialsError();
    }
  }

  async info(session: SessionData): Promise<AccountInfo> {
    const account = await this.deps.accounts.findById(session.accountId);
    if (!account) throw new InvalidCredentialsError();
    return {
      displayName: this.identity.displayName(account),
      email: decryptPii(account.emailEnc, this.deps.config.piiKey),
      role: account.role,
      mfaVerified: session.mfaVerified,
    };
  }

  /** Re-checks the password and leaves a short-lived proof other modules may consume once. */
  async reauthenticate(session: SessionData, password: string, ip: string): Promise<void> {
    await this.confirmPassword(session, password);
    await this.deps.sessions.markReauthenticated(session.accountId, REAUTH_TTL_SECONDS);
    await this.deps.events.record('reauthenticated', session.accountId, this.identity.hashIp(ip));
  }

  async changePassword(
    sessionId: string,
    session: SessionData,
    currentPassword: string,
    newPassword: string,
    ip: string,
  ): Promise<{ sessionId: string; session: SessionData }> {
    const errors = validateNewPassword(newPassword, 'newPassword');
    if (errors.length > 0) throw new ValidationError(errors);
    await this.confirmPassword(session, currentPassword);
    await this.deps.accounts.setPassword(session.accountId, await hashPassword(newPassword));
    await this.deps.sessions.revokeAllForAccount(session.accountId);
    const newId = await this.deps.sessions.create(session, this.deps.config.sessionTtlSeconds);
    await this.deps.events.record('password_changed', session.accountId, this.identity.hashIp(ip));
    const account = await this.deps.accounts.findById(session.accountId);
    if (account) {
      await this.notify(
        decryptPii(account.emailEnc, this.deps.config.piiKey),
        'Cambió tu contraseña',
        'La contraseña de tu cuenta se cambió. Si no fuiste tú, recupérala de inmediato.',
        account.id,
        ip,
      );
    }
    void sessionId;
    return { sessionId: newId, session };
  }

  private async notify(
    to: string,
    subject: string,
    text: string,
    accountId: string,
    ip: string,
  ): Promise<void> {
    try {
      await this.deps.email.send({ to, subject, text });
    } catch {
      await this.deps.events.record('email_delivery_failed', accountId, this.identity.hashIp(ip));
    }
  }

  /** The new address must be confirmed; the old one is warned (US3 scenario 2). */
  async requestEmailChange(
    session: SessionData,
    newEmailRaw: string,
    password: string,
    ip: string,
  ): Promise<void> {
    const newEmail = normalizeEmail(newEmailRaw);
    const errors = validateEmail(newEmail);
    if (errors.length > 0) throw new ValidationError(errors);
    await this.confirmPassword(session, password);
    const account = await this.deps.accounts.findById(session.accountId);
    if (!account) throw new InvalidCredentialsError();
    const { piiKey } = this.deps.config;
    const oldEmail = decryptPii(account.emailEnc, piiKey);
    await this.deps.events.record('email_change_requested', account.id, this.identity.hashIp(ip));
    await this.notify(
      oldEmail,
      'Solicitud de cambio de correo',
      'Se pidió cambiar el correo de tu cuenta. Si no fuiste tú, cambia tu contraseña de inmediato.',
      account.id,
      ip,
    );
    // Uniform behaviour: an address that is already taken simply never receives a link.
    const taken = await this.deps.accounts.findByEmailBlind(blindIndex(newEmail, piiKey));
    if (taken) return;
    const issued = issueToken('change_email', this.now());
    await this.deps.tokens.save({
      tokenHash: issued.tokenHash,
      accountId: account.id,
      purpose: 'change_email',
      expiresAt: issued.expiresAt,
      payloadEnc: encryptPii(newEmail, piiKey),
    });
    await this.notify(
      newEmail,
      'Confirma tu nuevo correo',
      `Confirma este correo con el enlace: ${this.deps.config.webBaseUrl}/perfil/confirmar-correo?token=${encodeURIComponent(issued.token)}`,
      account.id,
      ip,
    );
  }

  async confirmEmailChange(rawToken: string, ip: string): Promise<void> {
    const { accountId, payloadEnc } = await consumeOneTimeToken(
      this.deps.tokens,
      rawToken,
      'change_email',
      this.now(),
    );
    if (!payloadEnc) return;
    const { piiKey } = this.deps.config;
    const newEmail = decryptPii(payloadEnc, piiKey);
    const clash = await this.deps.accounts.findByEmailBlind(blindIndex(newEmail, piiKey));
    if (clash) {
      throw new ValidationError([{ field: 'email', message: 'Ese correo ya no está disponible.' }]);
    }
    await this.deps.accounts.setEmail(
      accountId,
      blindIndex(newEmail, piiKey),
      encryptPii(newEmail, piiKey),
    );
    await this.deps.events.record('email_changed', accountId, this.identity.hashIp(ip));
  }

  /** Erases identity data for a customer who asked to delete their account (FR-015, SC-006). */
  async eraseCustomerAccount(accountId: string): Promise<void> {
    const account = await this.deps.accounts.findById(accountId);
    if (!account || account.role !== 'customer' || account.emailEnc === 'erased') return;
    const email = decryptPii(account.emailEnc, this.deps.config.piiKey);
    await this.deps.accounts.erase(account.id);
    await this.deps.sessions.revokeAllForAccount(account.id);
    await this.deps.events.record('account_erased', account.id, null);
    await this.notify(
      email,
      'Tu cuenta fue eliminada',
      'Eliminamos tus datos personales y anonimizamos tus pedidos. Gracias por haber sido parte de la cafetería.',
      account.id,
      'system',
    );
  }
}
