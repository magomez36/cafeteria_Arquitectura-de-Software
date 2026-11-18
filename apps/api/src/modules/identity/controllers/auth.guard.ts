import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityService } from '../application/identity-service';
import { ForbiddenError, UnauthenticatedError } from '../domain/errors';
import type { Role, SessionData } from '../domain/ports';
import { clientIp, readCookie, SESSION_COOKIE, type HttpRequest } from './http-types';

const ROLES_KEY = 'identity:roles';
const UNVERIFIED_MFA_KEY = 'identity:allow-unverified-mfa';

/** Every guarded handler must declare its roles: no declaration means deny. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** Lets a staff/admin session that has not finished MFA enrollment reach the handler. */
export const AllowUnverifiedMfa = () => SetMetadata(UNVERIFIED_MFA_KEY, true);

export interface AuthenticatedRequest extends HttpRequest {
  auth?: { sessionId: string; session: SessionData };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly identity: IdentityService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionId = readCookie(req, SESSION_COOKIE);
    const session = await this.identity.getSession(sessionId);
    if (!sessionId || !session) throw new UnauthenticatedError();

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowUnverified = this.reflector.getAllAndOverride<boolean | undefined>(
      UNVERIFIED_MFA_KEY,
      [context.getHandler(), context.getClass()],
    );
    const roleAllowed = roles !== undefined && roles.includes(session.role);
    const mfaOk = session.role === 'customer' || session.mfaVerified || allowUnverified === true;
    if (!roleAllowed || !mfaOk) {
      await this.identity.recordAccessDenied(session.accountId, clientIp(req));
      throw new ForbiddenError();
    }
    req.auth = { sessionId, session };
    return true;
  }
}
