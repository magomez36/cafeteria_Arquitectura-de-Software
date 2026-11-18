# ADR 0001: TypeScript monorepo and modular API

- Status: accepted for the local foundation
- Date: 2026-11-15

## Context

Three contributors need a reproducible local base and independent feature ownership. The product constitution requires TypeScript, Next.js, NestJS, modular boundaries, accessibility, secure secret handling, tests, and reversible changes.

## Decision

Use Node.js 24 LTS, pnpm workspaces (10.12.4), Turborepo, strict TypeScript, Next.js App Router, a NestJS modular monolith, and a separate Node worker. Shared contracts and UI tokens live in workspace packages. Local dependencies use Compose (Postgres, Redis, RabbitMQ, Mailpit). Use `pg` plus `node-pg-migrate` with one ledger and advisory lock and module-owned migration directories. The feature flag package is only a package boundary in this phase; runtime Redis-backed flags are task T053.

## Alternatives and consequences

Separate services would multiply deployment and integration work before domain contracts stabilize, so the backend remains one modular monolith. The package manager and task graph make local commands consistent; root manifests and lockfile remain integrator-owned. Local Compose credentials are disposable examples and never production credentials. Vercel, Render, SonarQube and Grafana account configuration stays in later phases.
