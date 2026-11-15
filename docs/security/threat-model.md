# Initial platform threat model

## Assets and trust boundaries

- Source code, dependencies, package lock, build artifacts and CI credentials.
- Local Postgres, Redis, RabbitMQ and Mailpit developer data.
- Public web and API traffic versus private databases, queue and operational tooling.
- GitHub pull request code versus deployment credentials and protected environments.

## Main threats and controls

| Threat | Initial control |
|---|---|
| Secret committed to Git | `.env*` ignored except `.env.example`; later CI secret scanning is mandatory. |
| Malicious or vulnerable dependency | Frozen pnpm lockfile; high/critical dependency and image findings block merge in later CI tasks. |
| PR code accesses deployment credentials | CI for untrusted PRs has no deploy credentials; separate protected environments in later phases. |
| Cross-module data access | Nest module ownership and public TypeScript contracts; no private cross-module imports. |
| Local service exposed beyond developer machine | Compose publishes only local ports; production services must remain on private provider networking. |
| Migration race or destructive rollback | Central ledger, advisory serialization, module-owned expand/contract migrations. |

This is a starting inventory, not an ASVS review. Reassess when authentication, customer data, payments, or deployments are implemented.
