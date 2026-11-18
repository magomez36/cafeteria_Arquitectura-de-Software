import { randomBytes } from 'node:crypto';
import { ForbiddenError, ValidationError } from '../domain/errors';
import { issueToken } from '../domain/one-time-token';
import type { Account, SessionData } from '../domain/ports';
import { normalizeEmail, validateEmail, validateNewPassword } from '../domain/validation';
import { hashPassword } from '../infrastructure/password-hasher';
import { blindIndex, decryptPii, encryptPii } from '../infrastructure/pii-cipher';
import { consumeOneTimeToken } from './consume-token';
import type { IdentityDeps } from './identity-service';
import { IdentityService } from './identity-service';

export interface StaffSummary {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
  readonly mfaEnabled: boolean;
}

/** Staff administration (FR-009). Every method re-checks the admin role server-side. */
export class StaffService {
  constructor(
    private readonly deps: IdentityDeps,
    private readonly identity: IdentityService,
  ) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private async requireAdmin(actor: SessionData, ip: string): Promise<void> {
    if (actor.role !== 'admin' || !actor.mfaVerified) {
      await this.deps.events.record('access_denied', actor.accountId, this.identity.hashIp(ip));
      throw new ForbiddenError();
    }
  }

  private async staffTarget(id: string): Promise<Account> {
    const target = await this.deps.accounts.findById(id);
    if (!target || target.role !== 'staff') throw new ForbiddenError();
    return target;
  }

  async invite(
    actor: SessionData,
    input: { fullName: string; email: string },
    ip: string,
  ): Promise<void> {
    await this.requireAdmin(actor, ip);
    const email = normalizeEmail(input.email);
    const name = input.fullName.trim();
    const errors = [
      ...(name.length === 0 || name.length > 100
        ? [{ field: 'fullName', message: 'Escribe el nombre, de 1 a 100 caracteres.' }]
        : []),
      ...validateEmail(email),
    ];
    if (errors.length > 0) throw new ValidationError(errors);
    const { piiKey } = this.deps.config;
    // Unusable random password: the invited person chooses theirs through the invitation link.
    const created = await this.deps.accounts.create({
      emailBlind: blindIndex(email, piiKey),
      emailEnc: encryptPii(email, piiKey),
      displayNameEnc: encryptPii(name, piiKey),
      passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
      role: 'staff',
      status: 'pending',
      policyAcceptedAt: null,
    });
    if (!created) {
      throw new ValidationError([
        { field: 'email', message: 'Ya existe una cuenta con ese correo.' },
      ]);
    }
    const issued = issueToken('invite', this.now());
    await this.deps.tokens.save({
      tokenHash: issued.tokenHash,
      accountId: created.id,
      purpose: 'invite',
      expiresAt: issued.expiresAt,
    });
    await this.deps.events.record('role_changed', created.id, this.identity.hashIp(ip));
    try {
      await this.deps.email.send({
        to: email,
        subject: 'Invitación al equipo de la cafetería',
        text: `Hola ${name}, te invitamos al equipo. Después de elegir tu contraseña deberás configurar un segundo factor. Elige tu contraseña aquí: ${this.deps.config.webBaseUrl}/personal/invitacion?token=${encodeURIComponent(issued.token)}`,
      });
    } catch {
      await this.deps.events.record('email_delivery_failed', created.id, this.identity.hashIp(ip));
    }
  }

  async acceptInvite(rawToken: string, newPassword: string, ip: string): Promise<void> {
    const errors = validateNewPassword(newPassword, 'newPassword');
    if (errors.length > 0) throw new ValidationError(errors);
    const accountId = await consumeOneTimeToken(this.deps.tokens, rawToken, 'invite', this.now());
    await this.deps.accounts.setPassword(accountId, await hashPassword(newPassword));
    await this.deps.accounts.setStatus(accountId, 'active');
    await this.deps.events.record('email_verified', accountId, this.identity.hashIp(ip));
  }

  async deactivate(actor: SessionData, targetId: string, ip: string): Promise<void> {
    await this.requireAdmin(actor, ip);
    const target = await this.staffTarget(targetId);
    await this.deps.accounts.setStatus(target.id, 'disabled');
    await this.deps.sessions.revokeAllForAccount(target.id);
    await this.deps.events.record('account_disabled', target.id, this.identity.hashIp(ip));
  }

  async reactivate(actor: SessionData, targetId: string, ip: string): Promise<void> {
    await this.requireAdmin(actor, ip);
    const target = await this.staffTarget(targetId);
    await this.deps.accounts.setStatus(target.id, 'active');
    await this.deps.events.record('account_reactivated', target.id, this.identity.hashIp(ip));
  }

  /** Lost second factor: an admin resets it after verifying identity out of band. */
  async resetMfa(actor: SessionData, targetId: string, ip: string): Promise<void> {
    await this.requireAdmin(actor, ip);
    const target = await this.staffTarget(targetId);
    await this.deps.accounts.setMfa(target.id, null, false);
    await this.deps.sessions.revokeAllForAccount(target.id);
    await this.deps.events.record('mfa_reset', target.id, this.identity.hashIp(ip));
  }

  async list(actor: SessionData, ip: string): Promise<StaffSummary[]> {
    await this.requireAdmin(actor, ip);
    const accounts = await this.deps.accounts.listStaff();
    return accounts.map((a) => ({
      id: a.id,
      displayName: this.identity.displayName(a),
      email: decryptPii(a.emailEnc, this.deps.config.piiKey),
      role: a.role,
      status: a.status,
      mfaEnabled: a.mfaEnabled,
    }));
  }
}
