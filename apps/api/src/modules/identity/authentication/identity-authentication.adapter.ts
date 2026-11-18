import { Injectable } from '@nestjs/common';
import { IdentityService } from '../application/identity-service';
import type { AuthDecision, AuthenticateOptions, AuthenticationPort } from './authentication.port';

@Injectable()
export class IdentityAuthenticationAdapter implements AuthenticationPort {
  constructor(private readonly identity: IdentityService) {}

  async authenticate(
    sessionToken: string | null,
    options: AuthenticateOptions,
  ): Promise<AuthDecision> {
    const session = await this.identity.getSession(sessionToken);
    if (!session) return { ok: false, reason: 'unauthenticated' };

    const roleAllowed = options.allowedRoles.includes(session.role);
    const mfaOk = session.role === 'customer' || session.mfaVerified;
    if (!roleAllowed || !mfaOk) {
      await this.identity.recordAccessDenied(session.accountId, options.ip ?? '');
      return { ok: false, reason: 'forbidden' };
    }
    return {
      ok: true,
      identity: {
        identityId: session.accountId,
        roles: [session.role],
        mfaVerified: session.mfaVerified,
      },
    };
  }
}
