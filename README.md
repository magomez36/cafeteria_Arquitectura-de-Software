# Cafetería

Monorepo de TypeScript para la aplicación web de cafetería. La base contiene `apps/web` (Next.js), `apps/api` (NestJS), `apps/worker` y paquetes compartidos. Las funciones de Identidad, Clientes, Catálogo y Promociones se desarrollan en sus especificaciones y ramas asignadas.

## Requisitos

Comprueba `node --version` (`v24.x`), `pnpm --version` (`10.12.4`) y `docker compose version`. En una estacion temporal puedes usar `npm exec --yes --package=node@24 --package=pnpm@10.12.4 -- pnpm <comando>` sin cambiar la instalacion global.

- Windows 11, macOS o Linux.
- Node.js 24 LTS y pnpm 10.12.4 (`npm install --global pnpm@10.12.4` si Corepack no está disponible).
- Docker Desktop con Docker Compose v2.

En macOS/Linux usa `cp .env.example .env`; en Windows PowerShell usa `Copy-Item .env.example .env`. Mantén `pnpm install --frozen-lockfile` para instalaciones reproducibles y coordina cambios de manifiesto/lockfile con el integrador.

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

## Comprobaciones adicionales

Para suites de navegador instala Chromium con `pnpm --filter @cafeteria/web exec playwright install chromium` y ejecuta `pnpm --filter @cafeteria/web test:e2e`. La home y `/health` se cubren automaticamente; las verificaciones manuales NVDA/VoiceOver quedan registradas en [docs/accessibility/acceptance.md](docs/accessibility/acceptance.md).

- `pnpm coverage` crea reportes LCOV; solo un Quality Gate Sonar remoto calculado acredita el umbral de calidad.
- `pnpm --filter @cafeteria/api flags:set catalog.new-menu true|false` cambia un flag local en Redis. El API aplica la decision en servidor y expone solo un allowlist de lectura.
- Proveedores, workflows externos, Grafana y ramas protegidas necesitan configuracion real fuera del repositorio. Consulta `docs/deploy/`, `docs/observability/` y `docs/contributing/branch-protection.md`.

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
