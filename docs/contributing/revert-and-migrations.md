# Reversiones y migraciones compatibles

## Reglas de migración

- Cada módulo es dueño de su carpeta `apps/api/src/modules/<module>/migrations/`; los prefijos UTC `YYYYMMDDHHMMSS` son globalmente únicos.
- Las migraciones ya aplicadas son inmutables. Una corrección se implementa como nueva migración compensatoria, nunca editando el ledger ni ejecutando un `down` destructivo.
- Usar expand/contract: primero añadir columnas/tablas/índices compatibles (nullable o con default seguro), desplegar código que lea/escriba ambos formatos, backfill por lotes idempotentes, observar, y eliminar el formato viejo en un release posterior cuando ya no exista lector anterior.
- No renombrar ni eliminar columnas en el mismo release que introduce el reemplazo. Evitar locks largos; separar backfills y usar límites/reintentos.
- `pnpm db:migrate` toma advisory lock y corre el runner compartido antes de activar una versión nueva.

## Reversión de código

1. Crear cambios pequeños con un commit lógico y mensaje Conventional Commit.
2. Ante un defecto, crear un commit `revert:` mediante `git revert <sha>`; no reescribir historial compartido ni usar `reset --hard` sobre ramas publicadas.
3. El revert vuelve a atravesar todos los checks de PR y el despliegue de staging.
4. Si el esquema ya avanzó, conservar la migración aplicada y añadir una migración compensatoria compatible con la versión restaurada. Verificar ambos códigos antes de contraer el schema.
5. `fixup`/autosquash solo antes de publicar una rama y con coordinación del integrador; nunca en `main`.

## Validación

La prueba `apps/api/test/migrations/expand-contract.int-spec.ts` ejercita ambos lectores con PostgreSQL de Testcontainers. El ensayo de proveedor/staging y su resultado operativo permanecen en las tareas de despliegue; esta prueba local no afirma disponibilidad sin downtime en producción.
