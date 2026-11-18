/**
 * PROPOSAL for @cafeteria/contracts (leader-owned). Until the leader moves it there,
 * this file is the only public surface other modules may import from Identity.
 */
export const AUTHENTICATION_PORT = 'AUTHENTICATION_PORT';

export type AuthRole = 'customer' | 'staff' | 'admin';

/** Compatible with IdentityReference ({ identityId, roles }); adds only the MFA flag. */
export interface AuthenticatedIdentity {
  readonly identityId: string;
  readonly roles: readonly AuthRole[];
  readonly mfaVerified: boolean;
}

export type AuthDecision =
  | { readonly ok: true; readonly identity: AuthenticatedIdentity }
  | { readonly ok: false; readonly reason: 'unauthenticated' | 'forbidden' };

export interface AuthenticateOptions {
  /** Roles allowed for this operation. An empty list denies everyone. */
  readonly allowedRoles: readonly AuthRole[];
  /** Client IP, only used (hashed) for the access-denied security event. */
  readonly ip?: string;
}

export interface AuthenticationPort {
  /** `sessionToken` is the value of the `cafeteria_session` cookie, or null if absent. */
  authenticate(sessionToken: string | null, options: AuthenticateOptions): Promise<AuthDecision>;
}
