# Contract: AuthenticationPort (proposal to the leader)

Status: implemented in Identity, **shared-contract move proposed** (`packages/contracts` is leader-owned).

## Interface

Source of truth today: `apps/api/src/modules/identity/authentication/authentication.port.ts`.

```ts
export const AUTHENTICATION_PORT = 'AUTHENTICATION_PORT';
type AuthRole = 'customer' | 'staff' | 'admin';
interface AuthenticatedIdentity {
  identityId: string;
  roles: readonly AuthRole[];
  mfaVerified: boolean;
} // IdentityReference + mfaVerified
type AuthDecision =
  | { ok: true; identity: AuthenticatedIdentity }
  | { ok: false; reason: 'unauthenticated' | 'forbidden' };
interface AuthenticationPort {
  authenticate(
    sessionToken: string | null,
    o: { allowedRoles: readonly AuthRole[]; ip?: string },
  ): Promise<AuthDecision>;
}
```

## Semantics

- `sessionToken` = value of cookie `cafeteria_session`. Redis keys stay private to Identity.
- Missing/expired/revoked session -> `unauthenticated` (HTTP 401 in the caller).
- Role not in `allowedRoles`, empty list, or staff/admin with `mfaVerified=false` -> `forbidden` (403) and Identity records a `access_denied` security event (IP stored hashed).
- No personal data in the contract: no email, no display name. Only `identityId`, roles, MFA flag.

## Wiring

`IdentityModule` exports provider token `AUTHENTICATION_PORT`. A consumer module imports `IdentityModule` and injects `@Inject(AUTHENTICATION_PORT)`. It must not read Redis or import private Identity files.

## Proposed changes to leader-owned files

1. Move the interface + token to `packages/contracts/src/identity/authentication.port.ts`, export from `index.ts`; extend `IdentityReference` with optional `mfaVerified`.
2. Import the port from `@cafeteria/contracts` in Identity and Catalog (remove the local copy).
3. Add the lint boundary so Catalog may only import `@cafeteria/contracts`.

## Coupling found: Customers reads Identity sessions directly

`customers/infrastructure/adapters.ts` (`RedisSessionReader`) reads `identity:session:*` and `identity:reauth:*` from Redis. Fix proposal: Customers authenticates through `AuthenticationPort`; reauthentication proof gets a second method `consumeReauthentication(accountId)` on a sibling `ReauthenticationPort` in contracts. Not applied here because it needs the contracts change; until then it is a documented coupling.
