# Contrato de migraciones

## Tooling y layout

- Tool único: `node-pg-migrate` con `pg`; migraciones escritas en TypeScript. Un script raíz `pnpm db:migrate` ejecuta el mismo runner local y en el predeploy de Render.
- Cada módulo posee un directorio `apps/api/src/modules/<module>/migrations/`; el runner descubre los directorios mediante glob, pero aplica un orden global. Ledger compartido en Postgres; locking y validación de orden habilitados.
- Nombre de archivo: `<UTC timestamp>_<module>_<verb-noun>.ts`. Ejemplo: `20261115143000000_catalog_add-product-sku.ts`. El timestamp identifica orden global; módulo indica ownership; intención describe un cambio lógico. CI rechaza prefijos repetidos y migraciones fuera de orden.
- Cada migración modifica exclusivamente el schema de su módulo (por ejemplo `catalog`, `promotions`). No editar archivos de migración de otra carpeta.

## Compatibilidad y colaboración

- Solo expand/contract: añadir estructuras compatibles primero, desplegar lectores/escritores compatibles, migrar datos, dejar de usar la estructura anterior y retirarla en otro release.
- Una migración nueva debe funcionar mientras la versión anterior de API siga activa. Migración `down` destructiva prohibida en producción; revertir con nueva migración compensatoria que preserve datos.
- Pull requests de módulos pueden crear archivos independientes. El integrador resuelve orden global/rebase; no editar una lista central de migraciones. Runner usa advisory lock para impedir dos procesos migrando simultáneamente.
- Para un PR que trae migraciones de varias ramas, CI valida orden y compatibilidad contra la base resultante después de rebase. Cambios que no pasan se reordenan/recrean como migraciones nuevas, nunca reescribiendo historia ya aplicada.

## Comandos y entorno

- Local: `pnpm db:migrate` con Postgres de `infra/compose.yaml`.
- Despliegue: `preDeployCommand: pnpm db:migrate`; fallo cancela deploy antes de activar backend nuevo.
- Tests: Testcontainers/Postgres aplica migraciones desde una base vacía y sobre una versión de esquema anterior; se valida rollback de aplicación sin rollback destructivo de esquema.

La CLI `node-pg-migrate` soporta TypeScript y rutas/globs de migración; el runner valida orden y serializa ejecuciones con advisory lock. Es la misma ruta de migración en local, CI y predeploy, configurada desde la raíz del workspace.
