# Quickstart de validación: Plataforma de entrega

Guía de aceptación de la plataforma local implementada en T001–T020. Los comandos siguientes se ejecutan desde la raíz del repositorio en `feature/spec-1`.

## Prerrequisitos

- Git y Node.js LTS indicados por `.nvmrc`/`.node-version`.
- pnpm 10.12.4 (`npm install --global pnpm@10.12.4` si Corepack no está disponible).
- Docker Engine/Desktop con Compose.
- Acceso al repositorio GitHub para crear una rama y una propuesta de cambio.
- Para validar P2–P4: SonarQube, GitHub Actions/Environments, Vercel, Render, GHCR y Grafana con secretos de entorno configurados por responsables autorizados. No colocar valores en `.env.example` ni en Git.

## P0: levantar la base local

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
docker compose -f infra/compose.yaml up -d
pnpm db:migrate
pnpm dev
```

**Resultado esperado:** `pnpm dev` inicia simultáneamente Next.js en `apps/web`, NestJS en `apps/api` y el worker en `apps/worker`; página Next en `http://localhost:3000`, `GET http://localhost:4000/health` devuelve `{"status":"ok"}` y Postgres (`localhost:55432`), Redis, RabbitMQ y Mailpit se mantienen con healthchecks listos. `pnpm db:migrate` usa el ledger `cafeteria_migrations` y ejecuta migraciones module-local ordenadas. El `README.md` raíz indica URLs/puertos y diagnóstico multiplataforma.

## P0/P1: validar scripts del monorepo

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

**Resultado esperado:** todas las tareas existentes pasan desde la raíz; Turbo ejecuta dependencias en orden y omite paquetes no afectados en modo filtrado. Cada app/paquete mantiene sus propios scripts. Una modificación de documentación no exige cobertura de código.

## P1: validar el flujo colaborativo

1. Crear rama corta basada en `main` y un commit con Conventional Commits, por ejemplo `feat(api): add health endpoint`.
2. Confirmar que Husky valida el mensaje y lint-staged revisa solo archivos preparados.
3. Abrir PR; comprobar que GitHub Actions valida rango de commits, lint, tipos, suites disponibles y builds.
4. Probar un commit con mensaje inválido y una ejecución fallida: ambos deben bloquear checks/merge y mostrar la causa.
5. Confirmar que `main` requiere una aprobación, checks verdes, prohíbe push directo y conserva historial lineal.

**Resultado esperado:** el ejemplo válido queda listo para revisión y los casos inválidos no se pueden integrar. La protección remota se verifica en configuración de GitHub; los hooks locales no cuentan como control suficiente.

## P2: validar Quality Gate y seguridad

1. Generar reportes LCOV para cada workspace con código ejecutable y asociarlos al SHA analizado.
2. Abrir un PR deliberadamente debajo del umbral en un fixture controlado de desarrollo; confirmar que el estado Sonar falla y bloquea merge.
3. Confirmar cobertura ≥80% (≥95% en promociones/pedidos/pagos), 0 bugs/vulnerabilidades nuevos, hotspots revisados al 100%, duplicación <3%, ratings A.
4. Verificar SCA, escaneo de secretos e imagen. Eliminar el fixture y sus artefactos al concluir.
5. Ejecutar Testcontainers y Playwright + axe contra preview. Falla controlada debe aparecer como check rojo.

**Resultado esperado:** no se declara Sonar obligatorio hasta probar que un gate fallido es un check de GitHub requerido en la configuración monorepo seleccionada. Ver [research.md](research.md) para la limitación documentada y rutas alternativas.

## Verificaciones manuales antes de release

- Recorrer con NVDA (Windows) o VoiceOver (macOS) la página inicial y flujos críticos disponibles; registrar versión del lector, navegador, rutas recorridas, teclado y hallazgos en `docs/accessibility/acceptance.md`.
- No sustituir las verificaciones del lector de pantalla por axe. Los flujos que aún no existan se incorporan al plan del spec que los implemente.

## Feature flags (tras implementar US4)

- Local: cambiar una flag namespaced mediante `pnpm --filter @cafeteria/api flags:set catalog.new-menu true` y confirmar que API/UI observan el nuevo valor sin reiniciar procesos; probar default-off y Redis no disponible.
- Producción: ejecutar el comando solo en shell/job autorizado dentro de la red privada de Render; la API no tiene endpoint de escritura público.
- Contrato y casos: [feature-flags.md](contracts/feature-flags.md).

## P3: validar preview, staging y release

- En PR, frontend Vercel preview y backend preview (o staging compartido si el plan Render no habilita previews) usan solo datos de prueba.
- En merge a `main`, GHCR publica imágenes por SHA/digest; Render Blueprint y Vercel Git tienen el auto deploy apagado; Actions promueve artefactos validados sin reconstruir.
- Staging recibe el cambio y pasa smoke tests dentro de 20 minutos (SC-004). Si el deploy falla, mantiene la versión sana anterior y notifica.
- Release candidata espera aprobación humana; sin aprobación no inicia. Al aprobar, despliega backend primero y frontend después; migraciones predeploy fallidas cancelan la promoción.
- Inyectar un fallo de smoke en entorno controlado: frontend y backend regresan a los artefactos previos en menos de cinco minutos (SC-005). Verificar que esos artefactos siguen retenidos.
- Revertir un commit de staging y comprobar que el cambio atraviesa CI. Migraciones ya aplicadas se revierten con migración nueva; no con revert destructivo.
- Ejecutar `pnpm db:migrate` sobre base vacía y schema previo; confirmar que el runner ordena migraciones, usa advisory lock y cancela predeploy ante fallo.

## P4: validar observabilidad

- Integrar una ejecución CI y un despliegue de staging; comprobar que Grafana refleja SHA, estado y duración en menos de una hora (SC-008).
- Comprobar dashboards DORA, flujo, calidad, salud y aporte; filtros muestran contribuciones de revisión/tests/documentación sin ranking.
- Verificar que el acceso individual está restringido, se informó al equipo del propósito y los datos tienen retención definida.
- Ejecutar alerta de `main` en rojo y caída de Quality Gate. k6 corre programado solo contra staging.

## Referencias

- [Contratos CI y despliegue](contracts/)
- [Modelo de entidades](data-model.md)
- Criterios completos: [spec.md](spec.md), SC-001–SC-009 y FR-001–FR-024.
