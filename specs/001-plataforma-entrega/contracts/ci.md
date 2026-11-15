# Contrato de CI y Pull Request

Este documento define comportamiento observable de workflows; no prescribe una implementación YAML concreta.

## Trigger y seguridad

- PR workflows se disparan para `pull_request` contra `main`, incluyendo cambios a manifest/lock/config/workflows. No ejecutar código PR con secretos privilegiados ni usar `pull_request_target` para builds/tests del checkout propuesto.
- Workflows declaran `permissions` mínimos, fijan acciones externas por SHA, limitan concurrencia por PR/branch y cancelan ejecuciones obsoletas cuando sea seguro.
- CI de PR no tiene credenciales de Vercel/Render/GHCR ni secretos de producción. Deploy usa workflows de promoción y GitHub Environments separados.
- Nombres de checks requeridos son estables y únicos. Activar protección de rama después del primer run exitoso para seleccionar los status checks exactos.

## Entrada

`repository`, `pull_request.number`, `head.sha`, `base.sha`, rango de commits y cambios del workspace. La validación commit a commit ejecuta checks pertinentes contra cada SHA, en el mismo orden que el PR; el límite de tiempo habitual es <15 min para ≤10 commits (SC-001).

## Checks y resultados

1. Conventional Commits en cada commit del rango.
2. Install con lockfile inmutable.
3. Lint/format/typecheck y pruebas unitarias de paquetes afectados.
4. Integración con Postgres/Redis/RabbitMQ reales mediante Testcontainers.
5. Seguridad: dependencia vulnerable alta/crítica bloquea; cualquier secreto bloquea; imagen se construye y después Trivy escanea su digest; hallazgo alto/crítico en imagen bloquea; análisis estático CodeQL.
6. SonarQube con LCOV y gate de código nuevo.
7. Build de los artefactos afectados.
8. Deploy preview y E2E/axe cuando se habilite P2/P3.

Check concluye `success` solo si su control terminó correctamente. `failure`/`cancelled` de control obligatorio bloquea merge y muestra job/causa. Cambios solo de documentación usan controles aplicables sin exigir cobertura de código. Una integración externa caída no puede reportarse falsamente como gate aprobado: Sonar y seguridad obligatorios fallan cerrado; telemetría no bloqueante se reintenta y conserva eventos.

## Política de integración

GitHub `main`: PR obligatorio, mínimo 1 aprobación, checks requeridos verdes, sin push directo, historial lineal/rebase. El merge conserva commits atómicos. Hooks locales mejoran feedback, no sustituyen el check remoto.

## Cobertura y calidad

Sonar aplica al código nuevo: cobertura ≥80% (≥95% en `promociones`, `pedidos`, `pagos`), 0 bugs nuevos, 0 vulnerabilidades nuevas, 100% hotspots revisados, duplicación <3%, ratings A. `Not Computed` no es aprobación. Para monorepo, demostrar en PR real que fallo de Sonar bloquea merge antes de declarar ese check obligatorio.

## Salida

Un resumen de checks por PR con nombre, conclusión, enlace al log, SHA evaluado y duración. Si se produce un artefacto, incluir digest/identificador inmutable y metadatos de origen sin secretos.
