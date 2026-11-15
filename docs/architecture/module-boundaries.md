# Backend module boundaries

NestJS is a modular monolith. `identity`, `customers`, `catalog`, `promotions`, `cart`, `orders`, `payments`, `notifications` and `reports` are preregistered in `apps/api/src/app.module.ts` by the platform integrator. Feature owners work only under their module folder. Do not add domain behavior for these modules in the platform baseline.

Each module uses `controllers/` for HTTP adapters, `application/` for use cases, `domain/` for module-owned rules, `infrastructure/` for persistence/adapters, `migrations/` for its schema, and `tests/` for its tests. Keep API routes under `/api/v1/<module>` and use kebab-case resource paths. `/health` remains an operational endpoint.

Cross-module imports must use public exports from `@cafeteria/contracts`; never import another module's entity, repository, schema, controller, or implementation. Declare dependencies in the owning workspace manifest and ask the root integrator to update the lockfile. Global files (`apps/api/src/app.module.ts`, root manifests/config, and the lockfile) have one owner to prevent concurrent edits.

Database changes belong only to the owning module schema and migration directory. Use UTC timestamp prefixes `YYYYMMDDHHmmssSSS_<module>_<verb-noun>.ts`; keep migrations additive and expand/contract compatible. The shared migration runner discovers module directories and serializes execution through a PostgreSQL advisory lock.
