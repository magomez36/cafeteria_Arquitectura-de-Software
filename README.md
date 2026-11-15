# Cafetería

Monorepo de TypeScript para la aplicación web de cafetería. La base contiene `apps/web` (Next.js), `apps/api` (NestJS), `apps/worker` y paquetes compartidos. Las funciones de Identidad, Clientes, Catálogo y Promociones se desarrollan en sus especificaciones y ramas asignadas.

## Requisitos

- Windows 11, macOS o Linux.
- Node.js 24 LTS y pnpm 10.12.4 (`npm install --global pnpm@10.12.4` si Corepack no está disponible).
- Docker Desktop con Docker Compose v2.

## Instalación y ejecución

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
docker compose -f infra/compose.yaml up -d
pnpm db:migrate
pnpm dev
```

La web está en <http://localhost:3000>, la API en <http://localhost:4000/health>, RabbitMQ management en <http://localhost:15672> (guest/guest) y Mailpit en <http://localhost:8025>. Postgres usa el puerto local 55432 para evitar conflictos con instalaciones locales habituales en 5432; Redis y RabbitMQ exponen puertos locales para desarrollo. No uses estos valores fuera del entorno local.

En otra terminal, los controles de repositorio son `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`. `pnpm dev` inicia web, API y worker mediante Turborepo. El worker permanece en espera si no hay consumidor de dominio registrado.

## Migraciones

El comando `pnpm db:migrate` requiere Postgres de Compose y usa `node-pg-migrate`, una tabla de historial compartida y directorios propiedad de cada módulo bajo `apps/api/src/modules/*/migrations/`. Las nuevas migraciones deben tener timestamp UTC y prefijo del módulo; usa cambios expand/contract. No edites migraciones de otro módulo ni reviertas destructivamente una migración aplicada.

## Solución de problemas

- Si `pnpm` no se reconoce, instala la versión fijada con `npm install --global pnpm@10.12.4`, cierra y abre PowerShell y confirma `pnpm --version`.
- Si Compose no conecta, abre Docker Desktop, espera a que el Engine esté listo y comprueba `docker info`; luego ejecuta `docker compose -f infra/compose.yaml ps`.
- Si un puerto está ocupado, detén el servicio que lo usa o cambia el puerto local en `infra/compose.yaml` y actualiza `.env`.
- Si cambias manifiestos, el integrador regenera y revisa `pnpm-lock.yaml`; instala después con `pnpm install --frozen-lockfile`.
- Para restablecer datos locales: `docker compose -f infra/compose.yaml down -v` (esto elimina volúmenes locales).

## Colaboración

La guía de ownership, ramas, contratos y coordinación de archivos compartidos está en [docs/contributing/parallel-work.md](docs/contributing/parallel-work.md). La planificación activa del Spec #1 está en `specs/001-plataforma-entrega/`.
